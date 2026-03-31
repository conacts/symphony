import { problemSummary } from "../journal/symphony-run-journal-private.js";
import type {
  SymphonyIssueSummary,
  SymphonyRunExport,
  SymphonyRunJournal,
  SymphonyRunJournalListOptions,
  SymphonyRunJournalProblemRunsOptions,
  SymphonyRunSummary
} from "../journal/symphony-run-journal-types.js";

export type SymphonyForensicsIssueList = {
  issues: SymphonyIssueSummary[];
  problemRuns: SymphonyRunSummary[];
  problemSummary: Record<string, number>;
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

export interface SymphonyForensicsReadModel {
  issues(opts?: SymphonyRunJournalListOptions): Promise<SymphonyForensicsIssueList>;
  issueDetail(
    issueIdentifier: string,
    opts?: SymphonyRunJournalListOptions
  ): Promise<SymphonyForensicsIssueDetail | null>;
  runDetail(runId: string): Promise<SymphonyRunExport | null>;
  problemRuns(opts?: SymphonyRunJournalProblemRunsOptions): Promise<SymphonyForensicsProblemRuns>;
}

export function createSymphonyForensicsReadModel(
  journal: SymphonyRunJournal
): SymphonyForensicsReadModel {
  return {
    async issues(opts = {}) {
      const issues = await journal.listIssues(opts);
      const problemRuns = await journal.listProblemRuns({
        limit: opts.limit
      });

      return {
        issues,
        problemRuns,
        problemSummary: problemSummary(problemRuns)
      };
    },

    async issueDetail(issueIdentifier, opts = {}) {
      const runs = await journal.listRunsForIssue(issueIdentifier, opts);
      if (runs.length === 0) {
        return null;
      }

      return {
        issueIdentifier,
        runs,
        summary: {
          runCount: runs.length,
          latestProblemOutcome:
            runs.find((run) => run.outcome && !["completed", "completed_turn_batch", "merged", "done"].includes(run.outcome))
              ?.outcome ?? null,
          lastCompletedOutcome:
            runs.find((run) => run.outcome && ["completed", "completed_turn_batch", "merged", "done"].includes(run.outcome))
              ?.outcome ?? null
        },
        filters: {
          limit: opts.limit ?? null
        }
      };
    },

    async runDetail(runId) {
      return journal.fetchRunExport(runId);
    },

    async problemRuns(opts = {}) {
      const problemRuns = await journal.listProblemRuns(opts);

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
