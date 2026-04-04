import type {
  JsonValue,
  SymphonyForensicsIssueQuery as ContractSymphonyForensicsIssueQuery,
  SymphonyForensicsIssueDetailResult as ContractSymphonyForensicsIssueDetail,
  SymphonyForensicsIssueFlag as ContractSymphonyForensicsIssueFlag,
  SymphonyForensicsIssueForensicsBundleResult as ContractSymphonyForensicsIssueForensicsBundle,
  SymphonyForensicsIssueListResult as ContractSymphonyForensicsIssueList,
  SymphonyForensicsProblemRunsQuery as ContractSymphonyForensicsProblemRunsQuery,
  SymphonyForensicsIssueSortBy as ContractSymphonyForensicsIssueSortBy,
  SymphonyForensicsIssueSortDirection as ContractSymphonyForensicsIssueSortDirection,
  SymphonyForensicsIssueSummary as ContractSymphonyForensicsIssueSummary,
  SymphonyForensicsIssueTimeRange as ContractSymphonyForensicsIssueTimeRange,
  SymphonyForensicsIssueTimelineEntry as ContractSymphonyForensicsTimelineEntry,
  SymphonyForensicsIssuesQuery as ContractSymphonyForensicsIssuesQuery,
  SymphonyForensicsRunsQuery as ContractSymphonyForensicsRunsQuery,
  SymphonyForensicsProblemRunsResult as ContractSymphonyForensicsProblemRuns,
  SymphonyForensicsRunDetailResult
} from "@symphony/contracts";
import {
  buildIssueAggregate,
  buildIssueTotals,
  collectDistinctValues,
  compareIssueAggregates,
  countBy,
  groupRunsByIssue,
  matchesIssueFlags
} from "./symphony-forensics-aggregates.js";
import {
  filterRecordedEntries,
  normalizeDependencies,
  normalizeFilters
} from "./symphony-forensics-filters.js";
import {
  isCompletedOutcome,
  isProblemOutcome,
  problemSummary
} from "./symphony-forensics-run-classification.js";

const allRowsLimit = 100_000;

export type SymphonyForensicsIssueFlag = ContractSymphonyForensicsIssueFlag;
export type SymphonyForensicsIssueSortBy = ContractSymphonyForensicsIssueSortBy;
export type SymphonyForensicsIssueSortDirection = ContractSymphonyForensicsIssueSortDirection;
export type SymphonyForensicsIssueTimeRange = ContractSymphonyForensicsIssueTimeRange;
export type SymphonyForensicsIssuesQuery = Partial<
  Omit<ContractSymphonyForensicsIssuesQuery, "hasFlag">
> & {
  hasFlags?: SymphonyForensicsIssueFlag[];
};

export type SymphonyForensicsIssueFilters = {
  limit: number | null;
  timeRange: SymphonyForensicsIssueTimeRange;
  startedAfter: string | null;
  startedBefore: string | null;
  outcome: string | null;
  errorClass: string | null;
  hasFlags: SymphonyForensicsIssueFlag[];
  sortBy: SymphonyForensicsIssueSortBy;
  sortDirection: SymphonyForensicsIssueSortDirection;
};

export type SymphonyForensicsIssueAggregate = ContractSymphonyForensicsIssueSummary;

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

export type SymphonyForensicsIssueList = ContractSymphonyForensicsIssueList;

export type SymphonyForensicsRunSummary = ContractSymphonyForensicsIssueDetail["runs"][number];
export type SymphonyForensicsIssueDetail = ContractSymphonyForensicsIssueDetail;

export type SymphonyForensicsProblemRuns = ContractSymphonyForensicsProblemRuns;

export type SymphonyForensicsTimelineEntry = ContractSymphonyForensicsTimelineEntry;
export type SymphonyForensicsRunsQuery = Partial<ContractSymphonyForensicsRunsQuery>;
export type SymphonyForensicsIssueDetailQuery = Partial<ContractSymphonyForensicsIssueQuery>;
export type SymphonyForensicsProblemRunsQuery =
  Partial<ContractSymphonyForensicsProblemRunsQuery>;
export type SymphonyForensicsIssueForensicsBundle =
  ContractSymphonyForensicsIssueForensicsBundle;

export type SymphonyForensicsRuntimeLogEntry = {
  entryId: string;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  eventType: string;
  message: string;
  issueId: string | null;
  issueIdentifier: string | null;
  runId: string | null;
  payload: JsonValue;
  recordedAt: string;
};

export type SymphonyForensicsIssueForensicsBundleQuery =
  SymphonyForensicsIssuesQuery & {
    recentRunLimit?: number;
    timelineLimit?: number;
    runtimeLogLimit?: number;
  };

export type SymphonyForensicsReadModelDependencies = {
  runStore: SymphonyForensicsRunStore;
  listIssueTimeline?: (input: {
    issueIdentifier: string;
    limit?: number;
  }) => Promise<SymphonyForensicsTimelineEntry[]>;
  listRuntimeLogs?: (input: {
    issueIdentifier: string;
    limit?: number;
  }) => Promise<SymphonyForensicsRuntimeLogEntry[]>;
};

export interface SymphonyForensicsRunStore {
  listRuns(opts?: SymphonyForensicsRunsQuery): Promise<SymphonyForensicsRunSummary[]>;
  listRunsForIssue(
    issueIdentifier: string,
    opts?: SymphonyForensicsIssueDetailQuery
  ): Promise<SymphonyForensicsRunSummary[]>;
  listProblemRuns(
    opts?: SymphonyForensicsProblemRunsQuery
  ): Promise<SymphonyForensicsRunSummary[]>;
  fetchRunDetail(runId: string): Promise<SymphonyForensicsRunDetailResult | null>;
}

export interface SymphonyForensicsReadModel {
  issues(opts?: SymphonyForensicsIssuesQuery): Promise<SymphonyForensicsIssueList>;
  issueDetail(
    issueIdentifier: string,
    opts?: SymphonyForensicsIssueDetailQuery
  ): Promise<SymphonyForensicsIssueDetail | null>;
  issueForensicsBundle(
    issueIdentifier: string,
    opts?: SymphonyForensicsIssueForensicsBundleQuery
  ): Promise<SymphonyForensicsIssueForensicsBundle | null>;
  runDetail(runId: string): Promise<SymphonyForensicsRunDetailResult | null>;
  problemRuns(opts?: SymphonyForensicsProblemRunsQuery): Promise<SymphonyForensicsProblemRuns>;
}

export function createSymphonyForensicsReadModel(
  input: SymphonyForensicsRunStore | SymphonyForensicsReadModelDependencies
): SymphonyForensicsReadModel {
  const deps = normalizeDependencies(input);

  return {
    async issues(opts = {}) {
      const filters = normalizeFilters(opts);
      const [scopedRuns, facetRuns] = await Promise.all([
        deps.runStore.listRuns({
          limit: allRowsLimit,
          startedAfter: filters.startedAfter ?? undefined,
          startedBefore: filters.startedBefore ?? undefined,
          outcome: filters.outcome ?? undefined,
          errorClass: filters.errorClass ?? undefined
        }),
        deps.runStore.listRuns({
          limit: allRowsLimit,
          startedAfter: filters.startedAfter ?? undefined,
          startedBefore: filters.startedBefore ?? undefined
        })
      ]);

      const issues = Array.from(groupRunsByIssue(scopedRuns).entries())
        .map(([, runs]) => buildIssueAggregate(runs))
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
      const runs = await deps.runStore.listRunsForIssue(issueIdentifier, opts);
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
      const [runs, timelineEntries, runtimeLogs] = await Promise.all([
        deps.runStore.listRuns({
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

      const issue = buildIssueAggregate(runs);

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
      return deps.runStore.fetchRunDetail(runId);
    },

    async problemRuns(opts = {}) {
      const problemRuns = await deps.runStore.listProblemRuns(opts);

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
