import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueForensicsBundleResult,
  SymphonyForensicsIssueListResult,
  SymphonyForensicsProblemRunsResult,
  SymphonyForensicsRunDetailResult
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

export function buildIssueForensicsBundleViewModel(
  input: SymphonyForensicsIssueForensicsBundleResult
) {
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
        label: "Retries",
        value: formatCount(input.issue.retryCount),
        detail: "Observed retry attempts for this issue."
      },
      {
        label: "Latest problem",
        value: input.issue.latestProblemOutcome ?? "n/a",
        detail: "Most recent non-success outcome."
      },
      {
        label: "Last completed",
        value: input.issue.lastCompletedOutcome ?? "n/a",
        detail: "Most recent successful/completed outcome."
      }
    ],
    rows: input.recentRuns.map((run) => ({
      runId: run.runId,
      runHref: `/runs/${run.runId}`,
      startedAt: formatTimestamp(run.startedAt),
      durationSeconds:
        run.durationSeconds === null ? "n/a" : formatDuration(run.durationSeconds),
      totalTokens: formatCount(run.totalTokens),
      turnsAndEvents: `${formatCount(run.turnCount)} / ${formatCount(run.eventCount)}`,
      status: run.status ?? "n/a",
      outcome: run.outcome ?? "n/a"
    })),
    latestFailure:
      input.latestFailure === null
        ? null
        : {
            runId: input.latestFailure.runId,
            startedAt: formatTimestamp(input.latestFailure.startedAt),
            outcome: input.latestFailure.outcome ?? "n/a",
            errorClass: input.latestFailure.errorClass ?? "n/a",
            errorMessage: input.latestFailure.errorMessage ?? "n/a",
            timelineCount: formatCount(input.latestFailure.timelineEntries.length),
            runtimeLogCount: formatCount(input.latestFailure.runtimeLogs.length)
          },
    timelineRows: input.timeline.map((entry) => ({
      entryId: entry.entryId,
      recordedAt: formatTimestamp(entry.recordedAt),
      source: entry.source,
      eventType: entry.eventType,
      message: entry.message ?? "n/a",
      payloadText: prettyValue(entry.payload)
    })),
    runtimeLogRows: input.runtimeLogs.map((entry) => ({
      entryId: entry.entryId,
      recordedAt: formatTimestamp(entry.recordedAt),
      level: entry.level,
      source: entry.source,
      eventType: entry.eventType,
      message: entry.message,
      issueIdentifier: entry.issueIdentifier ?? "n/a",
      runId: entry.runId ?? "n/a",
      payloadText: prettyValue(entry.payload)
    }))
  };
}

export function buildProblemRunsViewModel(
  input: SymphonyForensicsProblemRunsResult
) {
  return {
    summaryCards: [
      {
        label: "Problem runs",
        value: formatCount(input.problemRuns.length)
      },
      {
        label: "Distinct outcomes",
        value: formatCount(Object.keys(input.problemSummary).length)
      }
    ],
    rows: input.problemRuns.map((run) => ({
      runId: run.runId,
      runHref: `/runs/${run.runId}`,
      issueIdentifier: run.issueIdentifier,
      issueHref: `/issues/${run.issueIdentifier}`,
      startedAt: formatTimestamp(run.startedAt),
      outcome: run.outcome ?? "n/a",
      errorClass: run.errorClass ?? "n/a",
      durationSeconds:
        run.durationSeconds === null ? "n/a" : formatDuration(run.durationSeconds),
      totalTokens: formatCount(run.totalTokens)
    })),
    outcomeSummary: Object.entries(input.problemSummary).map(([outcome, count]) => ({
      outcome,
      count: formatCount(count)
    }))
  };
}

export function buildRunDetailViewModel(input: SymphonyForensicsRunDetailResult) {
  const commitValue =
    input.run.commitHashEnd ??
    input.run.commitHashStart ??
    extractRepoSnapshotCommit(input.run.repoEnd) ??
    extractRepoSnapshotCommit(input.run.repoStart) ??
    "Unavailable";
  const durationValue =
    input.run.durationSeconds !== null
      ? formatDuration(input.run.durationSeconds)
      : null;

  return {
    issueIdentifier: input.issue.issueIdentifier,
    startedAt: formatTimestamp(input.run.startedAt),
    metrics: [
      {
        label: "Status",
        value: input.run.status ?? "n/a"
      },
      {
        label: "Duration",
        value: durationValue ?? "Unavailable"
      },
      {
        label: "Turns / events",
        value: `${formatCount(input.run.turnCount)} / ${formatCount(input.run.eventCount)}`
      },
      {
        label: "Total tokens",
        value: formatCount(input.run.totalTokens)
      },
      {
        label: "Commit",
        value: commitValue
      }
    ],
    repoStartText: formatRepoSnapshot(input.run.repoStart),
    repoEndText: formatRepoSnapshot(input.run.repoEnd),
    turns: [...input.turns]
      .sort((left, right) => right.turnSequence - left.turnSequence)
      .map((turn) => ({
      turnSequence: turn.turnSequence,
      title: `Turn ${turn.turnSequence}`,
      sessionLabel: turn.codexSessionId ?? turn.turnId,
      status: turn.status ?? "n/a",
      eventCount: formatCount(turn.eventCount),
      latestEventAt: formatTimestamp(turn.events.at(-1)?.recordedAt ?? null),
      latestEventType: turn.events.at(-1)?.eventType ?? "n/a",
      latestSummary:
        turn.events.at(-1)?.summary ??
        turn.events.at(-1)?.eventType ??
        "n/a",
      promptText: turn.promptText,
      events: [...turn.events]
        .sort((left, right) => {
          const sequenceDifference = right.eventSequence - left.eventSequence;

          if (sequenceDifference !== 0) {
            return sequenceDifference;
          }

          return compareTimestamps(right.recordedAt, left.recordedAt);
        })
        .map((event) => ({
          eventSequence: String(event.eventSequence),
          eventType: event.eventType,
          recordedAt: formatTimestamp(event.recordedAt),
          summary: event.summary ?? event.eventType ?? "n/a",
          payloadLabel: event.payloadTruncated
            ? "Show truncated payload"
            : "Show payload",
          payloadText: prettyValue(event.payload)
        }))
    }))
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

function formatRepoSnapshot(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "No repository snapshot was captured for this run.";
  }

  const snapshot = value as Record<string, unknown>;

  if (snapshot.available === false) {
    return typeof snapshot.error === "string"
      ? `Repository snapshot unavailable.\n\n${snapshot.error}`
      : "Repository snapshot unavailable.";
  }

  return prettyValue(value);
}

function extractRepoSnapshotCommit(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const commitHash = (value as Record<string, unknown>).commit_hash;

  return typeof commitHash === "string" && commitHash.length > 0 ? commitHash : null;
}

function compareTimestamps(
  left: string | null | undefined,
  right: string | null | undefined
): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return 0;
  }

  if (Number.isNaN(leftTime)) {
    return -1;
  }

  if (Number.isNaN(rightTime)) {
    return 1;
  }

  return leftTime - rightTime;
}
