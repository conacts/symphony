import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueForensicsBundleResult,
  SymphonyForensicsIssueListResult
} from "@symphony/contracts";
import {
  formatCount,
  formatDuration,
  formatPercent,
  formatTimestamp,
  prettyValue
} from "@/core/display-formatters";

export function buildIssueIndexViewModel(input: SymphonyForensicsIssueListResult) {
  const successRate =
    input.totals.runCount === 0
      ? 0
      : input.totals.completedRunCount / input.totals.runCount;
  const mostActiveIssue = [...input.issues].sort(
    (left, right) => right.runCount - left.runCount
  )[0];
  const highestProblemIssue = [...input.issues].sort(
    (left, right) => right.problemRate - left.problemRate
  )[0];
  const mostRetriedIssue = [...input.issues].sort(
    (left, right) => right.retryCount - left.retryCount
  )[0];
  const newestProblemIssue = [...input.issues]
    .filter(
      (issue) =>
        issue.latestProblemOutcome !== null || issue.latestErrorMessage !== null
    )
    .sort((left, right) =>
      (right.latestActivityAt ?? "").localeCompare(left.latestActivityAt ?? "")
    )[0];
  const outcomeChartRows = [...input.issues]
    .sort((left, right) => right.runCount - left.runCount)
    .slice(0, 6)
    .map((issue) => ({
      issueIdentifier: issue.issueIdentifier,
      completedRunCount: issue.completedRunCount,
      problemRunCount: issue.problemRunCount
    }));
  const pressureChartRows = [...input.issues]
    .sort(
      (left, right) =>
        right.retryCount +
        right.rateLimitedCount +
        right.maxTurnsCount -
        (left.retryCount + left.rateLimitedCount + left.maxTurnsCount)
    )
    .slice(0, 6)
    .map((issue) => ({
      issueIdentifier: issue.issueIdentifier,
      retryCount: issue.retryCount,
      rateLimitedCount: issue.rateLimitedCount,
      maxTurnsCount: issue.maxTurnsCount
    }));

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
    focusCards: [
      buildIssueFocusCard({
        label: "Most active issue",
        issue: mostActiveIssue,
        value: mostActiveIssue ? mostActiveIssue.issueIdentifier : "No issues",
        detail: mostActiveIssue
          ? `${formatCount(mostActiveIssue.runCount)} runs recorded.`
          : "No issue activity has been recorded yet."
      }),
      buildIssueFocusCard({
        label: "Highest problem rate",
        issue: highestProblemIssue,
        value: highestProblemIssue
          ? `${highestProblemIssue.issueIdentifier} · ${formatPercent(highestProblemIssue.problemRate)}`
          : "No issues",
        detail: highestProblemIssue
          ? `${highestProblemIssue.latestProblemOutcome ?? "No problem outcome"}`
          : "No issue activity has been recorded yet."
      }),
      buildIssueFocusCard({
        label: "Most retries",
        issue: mostRetriedIssue,
        value: mostRetriedIssue
          ? `${mostRetriedIssue.issueIdentifier} · ${formatCount(mostRetriedIssue.retryCount)}`
          : "No retries",
        detail: mostRetriedIssue
          ? `${mostRetriedIssue.latestErrorClass ?? "No retry error class"}`
          : "No issues are currently retry-heavy."
      }),
      buildIssueFocusCard({
        label: "Latest problem signal",
        issue: newestProblemIssue,
        value: newestProblemIssue
          ? newestProblemIssue.issueIdentifier
          : "No recent failures",
        detail: newestProblemIssue
          ? newestProblemIssue.latestErrorMessage ??
            newestProblemIssue.latestProblemOutcome ??
            "Problem outcome unavailable."
          : "The current issue set does not show a recent failure message."
      })
    ],
    outcomeChartRows,
    pressureChartRows,
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
      flags: issue.flags,
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
  const outcomeCounts = new Map<string, number>();
  const recentRuns = [...input.runs].slice(0, 8).reverse();
  const problemRuns = input.runs.filter(
    (run) => run.outcome !== null && run.outcome !== "completed"
  );
  const problemOutcomeCounts = new Map<string, number>();
  const errorClassCounts = new Map<string, number>();
  const latestFailure = problemRuns[0] ?? null;

  for (const run of input.runs) {
    const outcome = run.outcome ?? "unknown";
    outcomeCounts.set(outcome, (outcomeCounts.get(outcome) ?? 0) + 1);
  }

  for (const run of problemRuns) {
    if (run.outcome) {
      problemOutcomeCounts.set(
        run.outcome,
        (problemOutcomeCounts.get(run.outcome) ?? 0) + 1
      );
    }

    if (run.errorClass) {
      errorClassCounts.set(
        run.errorClass,
        (errorClassCounts.get(run.errorClass) ?? 0) + 1
      );
    }
  }

  const dominantProblemOutcome = sortCounts(problemOutcomeCounts)[0];
  const totalInputTokens = input.runs.reduce((total, run) => total + run.inputTokens, 0);
  const totalOutputTokens = input.runs.reduce((total, run) => total + run.outputTokens, 0);
  const averageTotalTokens =
    input.runs.length === 0
      ? 0
      : input.runs.reduce((total, run) => total + run.totalTokens, 0) / input.runs.length;
  const heaviestRun = [...input.runs].sort((left, right) => right.totalTokens - left.totalTokens)[0];

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
    outcomeChartRows: Array.from(outcomeCounts.entries()).map(([outcome, count]) => ({
      outcome,
      count
    })),
    tokenChartRows: recentRuns.map((run, index) => ({
      runLabel: buildIssueRunLabel(run.attempt, run.runId, index, recentRuns.length),
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens
    })),
    tokenCards: [
      {
        label: "Issue input tokens",
        value: formatCount(totalInputTokens),
        detail: `${formatCount(totalOutputTokens)} output tokens across recorded runs.`
      },
      {
        label: "Average run tokens",
        value: formatCount(Math.round(averageTotalTokens)),
        detail: "Average total token load per recorded run."
      },
      {
        label: "Heaviest run",
        value: heaviestRun ? heaviestRun.runId.slice(0, 8) : "n/a",
        detail: heaviestRun
          ? `${formatCount(heaviestRun.totalTokens)} total tokens on the heaviest run.`
          : "No token-heavy run is available yet."
      }
    ],
    failureCards: [
      {
        label: "Problem runs",
        value: formatCount(problemRuns.length),
        detail: "Non-success outcomes in this issue history."
      },
      {
        label: "Dominant failure",
        value: dominantProblemOutcome?.[0] ?? "n/a",
        detail: dominantProblemOutcome
          ? `${formatCount(dominantProblemOutcome[1])} runs currently cluster here.`
          : "No failure mode is currently dominant."
      },
      {
        label: "Latest error class",
        value: latestFailure?.errorClass ?? "n/a",
        detail:
          latestFailure?.errorMessage ??
          "No recent failure message has been recorded."
      }
    ],
    recentFailureRows: problemRuns.slice(0, 3).map((run) => ({
      runId: run.runId,
      runHref: `/runs/${run.runId}`,
      outcome: run.outcome ?? "n/a",
      errorClass: run.errorClass ?? "n/a",
      startedAt: formatTimestamp(run.startedAt),
      message: run.errorMessage ?? "No error message recorded."
    })),
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

function buildIssueRunLabel(
  attempt: number | null,
  runId: string,
  index: number,
  totalRuns: number
) {
  if (typeof attempt === "number" && attempt > 0) {
    return `#${attempt}`;
  }

  const ordinal = totalRuns - index;
  return `Run ${ordinal} · ${runId.slice(0, 6)}`;
}

function sortCounts(counts: Map<string, number>) {
  return Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });
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

function buildIssueFocusCard(input: {
  label: string;
  issue: SymphonyForensicsIssueListResult["issues"][number] | undefined;
  value: string;
  detail: string;
}) {
  return {
    label: input.label,
    href: input.issue ? `/issues/${input.issue.issueIdentifier}` : null,
    value: input.value,
    detail: input.detail
  };
}
