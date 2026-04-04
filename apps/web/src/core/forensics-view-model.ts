import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueForensicsBundleResult,
  SymphonyForensicsIssueListResult
} from "@symphony/contracts";

export function buildIssueIndexViewModel(input: SymphonyForensicsIssueListResult) {
  const successRate =
    input.totals.runCount === 0
      ? 0
      : input.totals.completedRunCount / input.totals.runCount;

  return {
    summaryCards: [
      {
        label: "Total issues",
        value: formatCount(input.totals.issueCount)
      },
      {
        label: "Total runs",
        value: formatCount(input.totals.runCount)
      },
      {
        label: "Problem runs",
        value: formatCount(input.totals.problemRunCount)
      },
      {
        label: "Success rate",
        value: formatPercent(successRate)
      },
      {
        label: "Rate-limited runs",
        value: formatCount(input.totals.rateLimitedCount)
      },
      {
        label: "Max-turn pauses",
        value: formatCount(input.totals.maxTurnsCount)
      }
    ],
    rows: input.issues.map((issue) => ({
      issueIdentifier: issue.issueIdentifier,
      issueHref: `/issues/${issue.issueIdentifier}`,
      runCount: formatCount(issue.runCount),
      problemRate: formatPercent(issue.problemRate),
      latestProblemOutcome: issue.latestProblemOutcome ?? "n/a",
      lastCompletedOutcome: issue.lastCompletedOutcome ?? "n/a",
      retryCount: formatCount(issue.retryCount),
      avgDuration: formatDuration(issue.avgDurationSeconds),
      lastActive: formatTimestamp(issue.latestActivityAt),
      latestErrorClass: issue.latestErrorClass ?? "n/a",
      latestErrorMessage: issue.latestErrorMessage ?? "n/a"
    })),
    filters: input.filters,
    facets: input.facets
  };
}

export function buildIssueDetailViewModel(
  input: SymphonyForensicsIssueDetailResult
) {
  return {
    metrics: [
      {
        label: "Runs",
        value: formatCount(input.summary.runCount),
        detail: "Recorded attempts for this issue."
      },
      {
        label: "Latest problem",
        value: input.summary.latestProblemOutcome ?? "n/a",
        detail: "Most recent non-success outcome."
      },
      {
        label: "Last completed",
        value: input.summary.lastCompletedOutcome ?? "n/a",
        detail: "Most recent successful/completed outcome."
      }
    ],
    rows: input.runs.map((run) => ({
      runId: run.runId,
      runHref: `/runs/${run.runId}`,
      startedAt: formatTimestamp(run.startedAt),
      durationSeconds:
        run.durationSeconds === null ? "n/a" : formatDuration(run.durationSeconds),
      totalTokens: formatCount(run.totalTokens),
      turnsAndEvents: `${formatCount(run.turnCount)} / ${formatCount(run.eventCount)}`,
      status: run.status ?? "n/a",
      outcome: run.outcome ?? "n/a"
    }))
  };
}

export function buildIssueActivityViewModel(
  input: SymphonyForensicsIssueForensicsBundleResult
) {
  const activityRows = [
    ...input.timeline.map((entry) => ({
      entryId: `timeline:${entry.entryId}`,
      recordedAt: entry.recordedAt,
      source: entry.source,
      eventType: entry.eventType,
      runId: entry.runId ?? "n/a",
      message: entry.message ?? "n/a",
      detail: prettyValue(entry.payload)
    })),
    ...input.runtimeLogs.map((entry) => ({
      entryId: `runtime:${entry.entryId}`,
      recordedAt: entry.recordedAt,
      source: `runtime:${entry.source}`,
      eventType: entry.eventType,
      runId: entry.runId ?? "n/a",
      message: entry.message,
      detail: prettyValue(entry.payload)
    }))
  ]
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .map((row) => ({
      ...row,
      recordedAt: formatTimestamp(row.recordedAt)
    }));

  return {
    metrics: [
      {
        label: "Runs",
        value: formatCount(input.issue.runCount),
        detail: "Recorded attempts for this issue."
      },
      {
        label: "Problem rate",
        value: formatPercent(input.issue.problemRate),
        detail: "Share of runs ending in a non-success outcome."
      },
      {
        label: "Timeline entries",
        value: formatCount(input.timeline.length),
        detail: "Persisted issue-level timeline events."
      },
      {
        label: "Runtime logs",
        value: formatCount(input.runtimeLogs.length),
        detail: "Persisted runtime-side logs for this issue."
      }
    ],
    latestFailure:
      input.latestFailure === null
        ? null
        : {
            runId: input.latestFailure.runId,
            startedAt: formatTimestamp(input.latestFailure.startedAt),
            outcome: input.latestFailure.outcome ?? "n/a",
            errorClass: input.latestFailure.errorClass ?? "n/a",
            errorMessage: input.latestFailure.errorMessage ?? "n/a"
          },
    activityRows
  };
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);
}

export function formatDuration(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

export function prettyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return JSON.stringify(value, null, 2);
}
