import { describe, expect, it } from "vitest";
import { buildFailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import { buildSymphonyForensicsIssueListResult } from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("failure analysis view model", () => {
  it("formats the current failure landscape from the issue inventory", () => {
    const viewModel = buildFailureAnalysisViewModel(
      buildSymphonyForensicsIssueListResult({
        issues: [
          {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            issueIdentifier: "COL-165",
            latestProblemOutcome: "max_turns",
            latestErrorClass: "max_turns",
            latestErrorMessage: "Reached max turns before completion.",
            problemRunCount: 2,
            retryCount: 2
          },
          {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            issueId: "issue_456",
            issueIdentifier: "COL-166",
            latestProblemOutcome: "startup_failure",
            latestErrorClass: "workspace_boot_failure",
            latestErrorMessage: "Workspace bootstrap failed.",
            problemRunCount: 3,
            retryCount: 1,
            latestActivityAt: "2026-03-31T19:05:00.000Z"
          },
          {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            issueId: "issue_789",
            issueIdentifier: "COL-167",
            latestProblemOutcome: "startup_failure",
            latestErrorClass: "workspace_boot_failure",
            latestErrorMessage: "Workspace bootstrap failed again.",
            problemRunCount: 1,
            retryCount: 0,
            latestActivityAt: "2026-03-31T17:05:00.000Z"
          }
        ],
        totals: {
          issueCount: 3,
          runCount: 8,
          completedRunCount: 1,
          problemRunCount: 6,
          rateLimitedCount: 0,
          maxTurnsCount: 1,
          startupFailureCount: 2,
          inputTokens: 6000,
          outputTokens: 2500,
          totalTokens: 8500
        }
      })
    );

    expect(viewModel.summaryCards[0]?.value).toBe("3");
    expect(viewModel.summaryCards[1]?.value).toBe("75%");
    expect(viewModel.summaryCards[2]?.value).toBe("2");
    expect(viewModel.summaryCards[3]?.value).toBe("startup_failure");
    expect(viewModel.failureModeRows[0]).toEqual({
      outcome: "startup_failure",
      issueCount: 2
    });
    expect(viewModel.errorClassRows[0]).toEqual({
      errorClass: "workspace_boot_failure",
      issueCount: 2
    });
    expect(viewModel.hotspotRows[0]?.issueIdentifier).toBe("COL-166");
    expect(viewModel.hotspotRows[0]?.problemRuns).toBe("3");
  });
});
