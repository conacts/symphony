import {
  isCompletedOutcome,
  isProblemOutcome
} from "@symphony/run-journal/internal";
import type {
  SymphonyIssueSummary,
  SymphonyRunSummary
} from "@symphony/run-journal";
import type {
  SymphonyForensicsIssueAggregate,
  SymphonyForensicsIssueFilters,
  SymphonyForensicsIssueFlag,
  SymphonyForensicsIssueTotals
} from "./symphony-forensics-read-model.js";

const defaultHighTokenBurnThreshold = 50_000;
const defaultLongDurationThresholdSeconds = 1_800;
const defaultManyRetriesThreshold = 2;

export function buildIssueAggregate(
  issue: SymphonyIssueSummary,
  runs: SymphonyRunSummary[]
): SymphonyForensicsIssueAggregate {
  const latestRun = runs[0] ?? null;
  const latestProblemRun = runs.find((run) => isProblemOutcome(run.outcome)) ?? null;
  const latestCompletedRun = runs.find((run) => isCompletedOutcome(run.outcome)) ?? null;
  const latestErrorRun =
    runs.find((run) => run.errorClass !== null || run.errorMessage !== null) ?? null;
  const completedRunCount = runs.filter((run) => isCompletedOutcome(run.outcome)).length;
  const problemRunCount = runs.filter((run) => isProblemOutcome(run.outcome)).length;
  const retryCount = runs.filter((run) => (run.attempt ?? 0) > 1).length;
  const latestRetryAttempt = runs.reduce(
    (maxAttempt, run) => Math.max(maxAttempt, run.attempt ?? 0),
    0
  );
  const rateLimitedCount = runs.filter((run) => isRateLimitedOutcome(run.outcome)).length;
  const maxTurnsCount = runs.filter((run) => isMaxTurnsOutcome(run.outcome)).length;
  const startupFailureCount = runs.filter((run) => isStartupFailureOutcome(run.outcome)).length;
  const totalInputTokens = runs.reduce((sum, run) => sum + run.inputTokens, 0);
  const totalOutputTokens = runs.reduce((sum, run) => sum + run.outputTokens, 0);
  const totalTokens = runs.reduce((sum, run) => sum + run.totalTokens, 0);
  const avgDurationSeconds = average(
    runs.map((run) => run.durationSeconds).filter((value): value is number => value !== null)
  );
  const avgTurns = average(runs.map((run) => run.turnCount));
  const avgEvents = average(runs.map((run) => run.eventCount));
  const latestActivityAt = runs.reduce<string | null>((latest, run) => {
    const candidate = run.lastEventAt ?? run.endedAt ?? run.startedAt;

    if (candidate === null) {
      return latest;
    }

    if (latest === null) {
      return candidate;
    }

    return Date.parse(candidate) > Date.parse(latest) ? candidate : latest;
  }, null);

  const flags: SymphonyForensicsIssueFlag[] = [];

  if (completedRunCount === 0) {
    flags.push("no_success");
  }
  if (rateLimitedCount > 0) {
    flags.push("rate_limited");
  }
  if (maxTurnsCount > 0) {
    flags.push("max_turns");
  }
  if (startupFailureCount > 0) {
    flags.push("startup_failure");
  }
  if ((runs.length === 0 ? 0 : totalTokens / runs.length) >= defaultHighTokenBurnThreshold) {
    flags.push("high_token_burn");
  }
  if (avgDurationSeconds >= defaultLongDurationThresholdSeconds) {
    flags.push("long_duration");
  }
  if (retryCount >= defaultManyRetriesThreshold) {
    flags.push("many_retries");
  }

  return {
    ...issue,
    latestRunStartedAt: latestRun?.startedAt ?? issue.latestRunStartedAt,
    latestRunId: latestRun?.runId ?? issue.latestRunId,
    latestRunStatus: latestRun?.status ?? issue.latestRunStatus,
    latestRunOutcome: latestRun?.outcome ?? issue.latestRunOutcome,
    runCount: runs.length,
    completedRunCount,
    problemRunCount,
    problemRate: runs.length === 0 ? 0 : problemRunCount / runs.length,
    latestProblemOutcome: latestProblemRun?.outcome ?? issue.latestProblemOutcome,
    lastCompletedOutcome: latestCompletedRun?.outcome ?? issue.lastCompletedOutcome,
    retryCount,
    latestRetryAttempt,
    rateLimitedCount,
    maxTurnsCount,
    startupFailureCount,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    avgDurationSeconds,
    avgTurns,
    avgEvents,
    latestErrorClass: latestErrorRun?.errorClass ?? null,
    latestErrorMessage: latestErrorRun?.errorMessage ?? null,
    latestActivityAt,
    flags
  };
}

export function buildIssueTotals(
  issues: SymphonyForensicsIssueAggregate[]
): SymphonyForensicsIssueTotals {
  return issues.reduce<SymphonyForensicsIssueTotals>(
    (totals, issue) => ({
      issueCount: totals.issueCount + 1,
      runCount: totals.runCount + issue.runCount,
      completedRunCount: totals.completedRunCount + issue.completedRunCount,
      problemRunCount: totals.problemRunCount + issue.problemRunCount,
      rateLimitedCount: totals.rateLimitedCount + issue.rateLimitedCount,
      maxTurnsCount: totals.maxTurnsCount + issue.maxTurnsCount,
      startupFailureCount: totals.startupFailureCount + issue.startupFailureCount,
      inputTokens: totals.inputTokens + issue.totalInputTokens,
      outputTokens: totals.outputTokens + issue.totalOutputTokens,
      totalTokens: totals.totalTokens + issue.totalTokens
    }),
    {
      issueCount: 0,
      runCount: 0,
      completedRunCount: 0,
      problemRunCount: 0,
      rateLimitedCount: 0,
      maxTurnsCount: 0,
      startupFailureCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
  );
}

export function groupRunsByIssue(
  runs: SymphonyRunSummary[]
): Map<string, SymphonyRunSummary[]> {
  const grouped = new Map<string, SymphonyRunSummary[]>();

  for (const run of runs) {
    const existingRuns = grouped.get(run.issueIdentifier);

    if (existingRuns) {
      existingRuns.push(run);
    } else {
      grouped.set(run.issueIdentifier, [run]);
    }
  }

  for (const issueRuns of grouped.values()) {
    issueRuns.sort((left, right) => compareDates(right.startedAt, left.startedAt));
  }

  return grouped;
}

export function requireIssueSummary(
  issues: ReadonlyMap<string, SymphonyIssueSummary>,
  issueIdentifier: string
): SymphonyIssueSummary {
  const issue = issues.get(issueIdentifier);

  if (issue) {
    return issue;
  }

  throw new TypeError(
    `Missing issue summary for ${issueIdentifier}. Issue records must exist before forensics queries run.`
  );
}

export function matchesIssueFlags(
  issue: SymphonyForensicsIssueAggregate,
  hasFlags: SymphonyForensicsIssueFlag[]
): boolean {
  if (hasFlags.length === 0) {
    return true;
  }

  return hasFlags.every((flag) => issue.flags.includes(flag));
}

export function compareIssueAggregates(
  left: SymphonyForensicsIssueAggregate,
  right: SymphonyForensicsIssueAggregate,
  filters: SymphonyForensicsIssueFilters
): number {
  let comparison: number;

  switch (filters.sortBy) {
    case "problemRate":
      comparison = left.problemRate - right.problemRate;
      break;
    case "totalTokens":
      comparison = left.totalTokens - right.totalTokens;
      break;
    case "retries":
      comparison = left.retryCount - right.retryCount;
      break;
    case "runCount":
      comparison = left.runCount - right.runCount;
      break;
    case "avgDuration":
      comparison = left.avgDurationSeconds - right.avgDurationSeconds;
      break;
    case "lastActive":
    default:
      comparison = compareDates(left.latestActivityAt, right.latestActivityAt);
      break;
  }

  if (comparison === 0) {
    comparison = compareDates(left.latestRunStartedAt, right.latestRunStartedAt);
  }

  if (comparison === 0) {
    comparison = left.issueIdentifier.localeCompare(right.issueIdentifier);
  }

  return filters.sortDirection === "asc" ? comparison : comparison * -1;
}

export function collectDistinctValues(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))].sort();
}

export function countBy(values: Array<string | null>): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    if (!value) {
      return counts;
    }

    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compareDates(left: string | null, right: string | null): number {
  const leftMs = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightMs = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;

  if (leftMs === rightMs) {
    return 0;
  }

  return leftMs > rightMs ? 1 : -1;
}

function isRateLimitedOutcome(outcome: string | null): boolean {
  return typeof outcome === "string" && outcome.includes("rate_limit");
}

function isMaxTurnsOutcome(outcome: string | null): boolean {
  return typeof outcome === "string" && outcome.includes("max_turn");
}

function isStartupFailureOutcome(outcome: string | null): boolean {
  return typeof outcome === "string" && outcome.includes("startup_failure");
}
