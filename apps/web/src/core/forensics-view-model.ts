import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueListResult,
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
      startedAt: run.startedAt ?? "n/a",
      durationSeconds: run.durationSeconds === null ? "n/a" : String(run.durationSeconds),
      turnsAndEvents: `${formatCount(run.turnCount)} / ${formatCount(run.eventCount)}`,
      status: run.status ?? "n/a",
      outcome: run.outcome ?? "n/a"
    }))
  };
}

export function buildRunDetailViewModel(input: SymphonyForensicsRunDetailResult) {
  return {
    metrics: [
      {
        label: "Issue",
        value: input.issue.issueIdentifier,
        detail: input.run.runId
      },
      {
        label: "Status",
        value: input.run.status ?? "n/a",
        detail: input.run.outcome ?? "n/a"
      },
      {
        label: "Started",
        value: input.run.startedAt ?? "n/a",
        detail: input.run.endedAt ?? "n/a"
      },
      {
        label: "Duration",
        value:
          input.run.durationSeconds === null
            ? "n/a"
            : `${input.run.durationSeconds}s`,
        detail: "Seconds elapsed for this run."
      },
      {
        label: "Turns / events",
        value: `${formatCount(input.run.turnCount)} / ${formatCount(input.run.eventCount)}`,
        detail: `${input.run.lastEventType ?? "n/a"} · ${input.run.lastEventAt ?? "n/a"}`
      },
      {
        label: "Commit",
        value: input.run.commitHashEnd ?? input.run.commitHashStart ?? "n/a",
        detail: `start ${input.run.commitHashStart ?? "n/a"}`
      }
    ],
    repoStartText: prettyValue(input.run.repoStart),
    repoEndText: prettyValue(input.run.repoEnd),
    turns: input.turns.map((turn) => ({
      turnSequence: turn.turnSequence,
      title: `Turn ${turn.turnSequence}`,
      sessionLabel: turn.codexSessionId ?? turn.turnId,
      status: turn.status ?? "n/a",
      eventCount: formatCount(turn.eventCount),
      promptText: turn.promptText,
      events: turn.events.map((event) => ({
        eventSequence: String(event.eventSequence),
        eventType: event.eventType,
        recordedAt: event.recordedAt ?? "n/a",
        summary: event.summary ?? event.eventType ?? "n/a",
        payloadLabel: event.payloadTruncated
          ? "Show truncated payload"
          : "Show payload",
        payloadText: prettyValue(event.payload)
      }))
    }))
  };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);
}

function formatDuration(value: number): string {
  if (value <= 0) {
    return "0s";
  }

  if (value >= 3600) {
    return `${(value / 3600).toFixed(1)}h`;
  }

  if (value >= 60) {
    return `${(value / 60).toFixed(1)}m`;
  }

  return `${Math.round(value)}s`;
}

function formatTimestamp(value: string | null): string {
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

function prettyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return JSON.stringify(value, null, 2);
}
