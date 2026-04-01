import {
  isCompletedOutcome,
  isProblemOutcome,
  problemSummary
} from "../journal/symphony-run-journal-private.js";
import type {
  SymphonyIssueSummary,
  SymphonyIsoTimestamp,
  SymphonyJsonValue,
  SymphonyRunExport,
  SymphonyRunJournal,
  SymphonyRunJournalListOptions,
  SymphonyRunJournalProblemRunsOptions,
  SymphonyRunSummary
} from "../journal/symphony-run-journal-types.js";

const allRowsLimit = 100_000;
const defaultHighTokenBurnThreshold = 50_000;
const defaultLongDurationThresholdSeconds = 1_800;
const defaultManyRetriesThreshold = 2;

export type SymphonyForensicsIssueFlag =
  | "rate_limited"
  | "max_turns"
  | "startup_failure"
  | "no_success"
  | "high_token_burn"
  | "long_duration"
  | "many_retries";

export type SymphonyForensicsIssueSortBy =
  | "lastActive"
  | "problemRate"
  | "totalTokens"
  | "retries"
  | "runCount"
  | "avgDuration";

export type SymphonyForensicsIssueSortDirection = "asc" | "desc";

export type SymphonyForensicsIssueTimeRange =
  | "all"
  | "24h"
  | "7d"
  | "30d"
  | "custom";

export type SymphonyForensicsIssueFilters = {
  limit: number | null;
  timeRange: SymphonyForensicsIssueTimeRange;
  startedAfter: SymphonyIsoTimestamp | null;
  startedBefore: SymphonyIsoTimestamp | null;
  outcome: string | null;
  errorClass: string | null;
  hasFlags: SymphonyForensicsIssueFlag[];
  sortBy: SymphonyForensicsIssueSortBy;
  sortDirection: SymphonyForensicsIssueSortDirection;
};

export type SymphonyForensicsIssueAggregate = SymphonyIssueSummary & {
  completedRunCount: number;
  problemRunCount: number;
  problemRate: number;
  retryCount: number;
  latestRetryAttempt: number;
  rateLimitedCount: number;
  maxTurnsCount: number;
  startupFailureCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  avgDurationSeconds: number;
  avgTurns: number;
  avgEvents: number;
  latestErrorClass: string | null;
  latestErrorMessage: string | null;
  latestActivityAt: SymphonyIsoTimestamp | null;
  flags: SymphonyForensicsIssueFlag[];
};

export type SymphonyForensicsIssueTotals = {
  issueCount: number;
  runCount: number;
  completedRunCount: number;
  problemRunCount: number;
  rateLimitedCount: number;
  maxTurnsCount: number;
  startupFailureCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type SymphonyForensicsIssueList = {
  issues: SymphonyForensicsIssueAggregate[];
  totals: SymphonyForensicsIssueTotals;
  filters: SymphonyForensicsIssueFilters;
  facets: {
    outcomes: string[];
    errorClasses: string[];
  };
};

export type SymphonyForensicsIssueDetail = {
  issueIdentifier: string;
  runs: SymphonyRunSummary[];
  summary: {
    runCount: number;
    latestProblemOutcome: string | null;
    lastCompletedOutcome: string | null;
  };
  filters: {
    limit: number | null;
  };
};

export type SymphonyForensicsProblemRuns = {
  problemRuns: SymphonyRunSummary[];
  problemSummary: Record<string, number>;
  filters: {
    outcome: string | null;
    issueIdentifier: string | null;
    limit: number | null;
  };
};

export type SymphonyForensicsTimelineEntry = {
  entryId: string;
  issueId: string;
  issueIdentifier: string;
  runId: string | null;
  turnId: string | null;
  source: "orchestrator" | "codex" | "tracker" | "workspace" | "runtime";
  eventType: string;
  message: string | null;
  payload: SymphonyJsonValue;
  recordedAt: string;
};

export type SymphonyForensicsRuntimeLogEntry = {
  entryId: string;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  eventType: string;
  message: string;
  issueId: string | null;
  issueIdentifier: string | null;
  runId: string | null;
  payload: SymphonyJsonValue;
  recordedAt: string;
};

export type SymphonyForensicsIssueForensicsBundle = {
  issue: SymphonyForensicsIssueAggregate;
  recentRuns: SymphonyRunSummary[];
  distributions: {
    outcomes: Record<string, number>;
    errorClasses: Record<string, number>;
    timelineEvents: Record<string, number>;
  };
  latestFailure: {
    runId: string;
    startedAt: string | null;
    outcome: string | null;
    errorClass: string | null;
    errorMessage: string | null;
    timelineEntries: SymphonyForensicsTimelineEntry[];
    runtimeLogs: SymphonyForensicsRuntimeLogEntry[];
  } | null;
  timeline: SymphonyForensicsTimelineEntry[];
  runtimeLogs: SymphonyForensicsRuntimeLogEntry[];
  filters: SymphonyForensicsIssueFilters;
};

export type SymphonyForensicsIssuesQuery = {
  limit?: number;
  timeRange?: SymphonyForensicsIssueTimeRange;
  startedAfter?: string;
  startedBefore?: string;
  outcome?: string;
  errorClass?: string;
  hasFlags?: SymphonyForensicsIssueFlag[];
  sortBy?: SymphonyForensicsIssueSortBy;
  sortDirection?: SymphonyForensicsIssueSortDirection;
};

export type SymphonyForensicsIssueForensicsBundleQuery =
  SymphonyForensicsIssuesQuery & {
    recentRunLimit?: number;
    timelineLimit?: number;
    runtimeLogLimit?: number;
  };

export type SymphonyForensicsReadModelDependencies = {
  journal: SymphonyRunJournal;
  listIssueTimeline?: (input: {
    issueIdentifier: string;
    limit?: number;
  }) => Promise<SymphonyForensicsTimelineEntry[]>;
  listRuntimeLogs?: (input: {
    issueIdentifier: string;
    limit?: number;
  }) => Promise<SymphonyForensicsRuntimeLogEntry[]>;
};

export interface SymphonyForensicsReadModel {
  issues(opts?: SymphonyForensicsIssuesQuery): Promise<SymphonyForensicsIssueList>;
  issueDetail(
    issueIdentifier: string,
    opts?: SymphonyRunJournalListOptions
  ): Promise<SymphonyForensicsIssueDetail | null>;
  issueForensicsBundle(
    issueIdentifier: string,
    opts?: SymphonyForensicsIssueForensicsBundleQuery
  ): Promise<SymphonyForensicsIssueForensicsBundle | null>;
  runDetail(runId: string): Promise<SymphonyRunExport | null>;
  problemRuns(opts?: SymphonyRunJournalProblemRunsOptions): Promise<SymphonyForensicsProblemRuns>;
}

export function createSymphonyForensicsReadModel(
  input: SymphonyRunJournal | SymphonyForensicsReadModelDependencies
): SymphonyForensicsReadModel {
  const deps = normalizeDependencies(input);

  return {
    async issues(opts = {}) {
      const filters = normalizeFilters(opts);
      const [issueRecords, scopedRuns, facetRuns] = await Promise.all([
        deps.journal.listIssues({
          limit: allRowsLimit
        }),
        deps.journal.listRuns({
          limit: allRowsLimit,
          startedAfter: filters.startedAfter ?? undefined,
          startedBefore: filters.startedBefore ?? undefined,
          outcome: filters.outcome ?? undefined,
          errorClass: filters.errorClass ?? undefined
        }),
        deps.journal.listRuns({
          limit: allRowsLimit,
          startedAfter: filters.startedAfter ?? undefined,
          startedBefore: filters.startedBefore ?? undefined
        })
      ]);

      const issueRecordMap = new Map(
        issueRecords.map((issue) => [issue.issueIdentifier, issue] as const)
      );
      const issues = Array.from(groupRunsByIssue(scopedRuns).entries())
        .map(([issueIdentifier, runs]) =>
          buildIssueAggregate(
            requireIssueSummary(issueRecordMap, issueIdentifier),
            runs
          )
        )
        .filter((issue) => matchesIssueFlags(issue, filters.hasFlags))
        .sort((left, right) => compareIssueAggregates(left, right, filters));

      const visibleIssues = filters.limit === null ? issues : issues.slice(0, filters.limit);

      return {
        issues: visibleIssues,
        totals: buildIssueTotals(visibleIssues),
        filters,
        facets: {
          outcomes: collectDistinctValues(facetRuns.map((run) => run.outcome)),
          errorClasses: collectDistinctValues(facetRuns.map((run) => run.errorClass))
        }
      };
    },

    async issueDetail(issueIdentifier, opts = {}) {
      const runs = await deps.journal.listRunsForIssue(issueIdentifier, opts);
      if (runs.length === 0) {
        return null;
      }

      return {
        issueIdentifier,
        runs,
        summary: {
          runCount: runs.length,
          latestProblemOutcome: runs.find((run) => isProblemOutcome(run.outcome))?.outcome ?? null,
          lastCompletedOutcome:
            runs.find((run) => isCompletedOutcome(run.outcome))?.outcome ?? null
        },
        filters: {
          limit: opts.limit ?? null
        }
      };
    },

    async issueForensicsBundle(issueIdentifier, opts = {}) {
      const filters = normalizeFilters(opts);
      const [issueRecords, runs, timelineEntries, runtimeLogs] = await Promise.all([
        deps.journal.listIssues({
          limit: allRowsLimit
        }),
        deps.journal.listRuns({
          limit: allRowsLimit,
          issueIdentifier,
          startedAfter: filters.startedAfter ?? undefined,
          startedBefore: filters.startedBefore ?? undefined,
          outcome: filters.outcome ?? undefined,
          errorClass: filters.errorClass ?? undefined
        }),
        deps.listIssueTimeline
          ? deps.listIssueTimeline({
              issueIdentifier,
              limit: opts.timelineLimit ?? allRowsLimit
            })
          : Promise.resolve([]),
        deps.listRuntimeLogs
          ? deps.listRuntimeLogs({
              issueIdentifier,
              limit: opts.runtimeLogLimit ?? allRowsLimit
            })
          : Promise.resolve([])
      ]);

      if (runs.length === 0) {
        return null;
      }

      const issueRecordMap = new Map(
        issueRecords.map((issue) => [issue.issueIdentifier, issue] as const)
      );
      const issueRecord = requireIssueSummary(issueRecordMap, issueIdentifier);
      const issue = buildIssueAggregate(issueRecord, runs);

      if (!matchesIssueFlags(issue, filters.hasFlags)) {
        return null;
      }

      const scopedTimeline = filterRecordedEntries(timelineEntries, filters);
      const scopedRuntimeLogs = filterRecordedEntries(runtimeLogs, filters);
      const latestFailureRun = runs.find((run) => isProblemOutcome(run.outcome)) ?? null;

      return {
        issue,
        recentRuns: runs.slice(0, opts.recentRunLimit ?? 8),
        distributions: {
          outcomes: countBy(runs.map((run) => run.outcome)),
          errorClasses: countBy(runs.map((run) => run.errorClass)),
          timelineEvents: countBy(scopedTimeline.map((entry) => entry.eventType))
        },
        latestFailure: latestFailureRun
          ? {
              runId: latestFailureRun.runId,
              startedAt: latestFailureRun.startedAt,
              outcome: latestFailureRun.outcome,
              errorClass: latestFailureRun.errorClass,
              errorMessage: latestFailureRun.errorMessage,
              timelineEntries: scopedTimeline.filter(
                (entry) => entry.runId === latestFailureRun.runId
              ),
              runtimeLogs: scopedRuntimeLogs.filter(
                (entry) => entry.runId === latestFailureRun.runId
              )
            }
          : null,
        timeline: scopedTimeline,
        runtimeLogs: scopedRuntimeLogs,
        filters
      };
    },

    async runDetail(runId) {
      return deps.journal.fetchRunExport(runId);
    },

    async problemRuns(opts = {}) {
      const problemRuns = await deps.journal.listProblemRuns(opts);

      return {
        problemRuns,
        problemSummary: problemSummary(problemRuns),
        filters: {
          outcome: opts.outcome ?? null,
          issueIdentifier: opts.issueIdentifier ?? null,
          limit: opts.limit ?? null
        }
      };
    }
  };
}

function normalizeDependencies(
  input: SymphonyRunJournal | SymphonyForensicsReadModelDependencies
): SymphonyForensicsReadModelDependencies {
  if ("journal" in input) {
    return {
      listIssueTimeline: async () => [],
      listRuntimeLogs: async () => [],
      ...input
    };
  }

  return {
    journal: input,
    listIssueTimeline: async () => [],
    listRuntimeLogs: async () => []
  };
}

function normalizeFilters(input: SymphonyForensicsIssuesQuery): SymphonyForensicsIssueFilters {
  return {
    limit: input.limit ?? null,
    timeRange: input.timeRange ?? "all",
    startedAfter: input.startedAfter ?? null,
    startedBefore: input.startedBefore ?? null,
    outcome: input.outcome ?? null,
    errorClass: input.errorClass ?? null,
    hasFlags: input.hasFlags ?? [],
    sortBy: input.sortBy ?? "lastActive",
    sortDirection: input.sortDirection ?? "desc"
  };
}

function buildIssueAggregate(
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

function buildIssueTotals(
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

function groupRunsByIssue(runs: SymphonyRunSummary[]): Map<string, SymphonyRunSummary[]> {
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

function requireIssueSummary(
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

function matchesIssueFlags(
  issue: SymphonyForensicsIssueAggregate,
  hasFlags: SymphonyForensicsIssueFlag[]
): boolean {
  if (hasFlags.length === 0) {
    return true;
  }

  return hasFlags.every((flag) => issue.flags.includes(flag));
}

function compareIssueAggregates(
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

function collectDistinctValues(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))].sort();
}

function countBy(values: Array<string | null>): Record<string, number> {
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

function filterRecordedEntries<T extends { recordedAt: string }>(
  entries: T[],
  filters: SymphonyForensicsIssueFilters
): T[] {
  return entries.filter((entry) => {
    const recordedAtMs = Date.parse(entry.recordedAt);

    if (filters.startedAfter) {
      const startedAfterMs = Date.parse(filters.startedAfter);

      if (!Number.isNaN(recordedAtMs) && !Number.isNaN(startedAfterMs) && recordedAtMs < startedAfterMs) {
        return false;
      }
    }

    if (filters.startedBefore) {
      const startedBeforeMs = Date.parse(filters.startedBefore);

      if (!Number.isNaN(recordedAtMs) && !Number.isNaN(startedBeforeMs) && recordedAtMs > startedBeforeMs) {
        return false;
      }
    }

    return true;
  });
}
