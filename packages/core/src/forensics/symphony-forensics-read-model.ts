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
import {
  buildIssueAggregate,
  buildIssueTotals,
  collectDistinctValues,
  compareIssueAggregates,
  countBy,
  groupRunsByIssue,
  matchesIssueFlags,
  requireIssueSummary
} from "./symphony-forensics-aggregates.js";
import {
  filterRecordedEntries,
  normalizeDependencies,
  normalizeFilters
} from "./symphony-forensics-filters.js";

const allRowsLimit = 100_000;

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
