import { describe, expect, it } from "vitest";
import {
  buildFailureAnalysisViewModel,
  buildFailureAnalysisViewModelFromSample
} from "@/features/analysis/model/failure-analysis-view-model";
import {
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsIssueDetailResult,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("failure analysis view model", () => {
  it("formats the current failure landscape from the issue inventory", () => {
    const viewModel = buildFailureAnalysisViewModel(
      buildSymphonyForensicsIssueListResult({
        issues: [
          {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            issueIdentifier: "COL-165",
            latestProblemOutcome: "paused_max_turns",
            latestErrorClass: "max_turns",
            latestErrorMessage: "Reached max turns before completion.",
            problemRunCount: 2,
            retryCount: 2
          },
          {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            trackerIssueId: "issue_456",
            issueIdentifier: "COL-166",
            latestProblemOutcome: "startup_failed",
            latestErrorClass: "workspace_boot_failure",
            latestErrorMessage: "Workspace bootstrap failed.",
            problemRunCount: 3,
            retryCount: 1,
            latestActivityAt: "2026-03-31T19:05:00.000Z"
          },
          {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            trackerIssueId: "issue_789",
            issueIdentifier: "COL-167",
            latestProblemOutcome: "startup_failed",
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
          cachedInputTokens: 0,
          outputTokens: 2500,
          totalTokens: 8500
        }
      })
    );

    expect(viewModel.summaryCards).toHaveLength(3);
    expect(viewModel.summaryCards[0]?.value).toBe("6");
    expect(viewModel.summaryCards[1]?.value).toBe("3");
    expect(viewModel.summaryCards[2]?.value).toBe("75%");
    expect(viewModel.failureModeRows[0]).toEqual({
      outcome: "Startup failed",
      issueCount: 2
    });
    expect(viewModel.errorClassRows[0]).toEqual({
      errorClass: "Workspace boot failure",
      issueCount: 2
    });
    expect(viewModel.hotspotRows[0]?.issueIdentifier).toBe("COL-166");
    expect(viewModel.hotspotRows[0]?.latestProblemOutcome).toBe("Startup failed");
    expect(viewModel.hotspotRows[0]?.latestErrorClass).toBe("Workspace boot failure");
    expect(viewModel.hotspotRows[0]?.problemRuns).toBe("3");
    expect(viewModel.timeSeriesRows).toHaveLength(0);
  });

  it("builds a filtered failure landscape with a daily failure series", () => {
    const viewModel = buildFailureAnalysisViewModelFromSample(
      {
        issueIndex: buildSymphonyForensicsIssueListResult(),
        sampledRuns: [
          {
            repositoryKey: "symphony",
            issueIdentifier: "COL-165",
            run: {
              ...buildSymphonyForensicsIssueDetailResult().runs[0]!,
              runId: "run_a",
              outcome: "completed",
              errorClass: null,
              errorMessage: null,
              startedAt: "2026-03-30T10:00:00.000Z"
            },
            artifacts: buildSymphonyAgentRunArtifactsResult()
          },
          {
            repositoryKey: "symphony",
            issueIdentifier: "COL-165",
            run: {
              ...buildSymphonyForensicsIssueDetailResult().runs[0]!,
              runId: "run_b",
              outcome: "paused_max_turns",
              errorClass: "max_turns",
              errorMessage: "Reached max turns before completion.",
              startedAt: "2026-03-30T19:00:00.000Z"
            },
            artifacts: buildSymphonyAgentRunArtifactsResult({
              run: {
                ...buildSymphonyAgentRunArtifactsResult().run,
                runId: "run_b"
              }
            })
          },
          {
            repositoryKey: "symphony",
            issueIdentifier: "COL-166",
            run: {
              ...buildSymphonyForensicsIssueDetailResult().runs[0]!,
              runId: "run_c",
              trackerIssueId: "issue_456",
              issueIdentifier: "COL-166",
              outcome: "startup_failed",
              errorClass: "startup_failure_runtime_prepare",
              errorMessage: "Workspace failed to boot.",
              startedAt: "2026-03-31T20:00:00.000Z"
            },
            artifacts: buildSymphonyAgentRunArtifactsResult({
              run: {
                ...buildSymphonyAgentRunArtifactsResult().run,
                runId: "run_c",
                trackerIssueId: "issue_456",
                issueIdentifier: "COL-166"
              }
            })
          }
        ]
      },
      {
        timeRange: "7d",
        now: Date.parse("2026-03-31T23:00:00.000Z")
      }
    );

    expect(viewModel.summaryCards[0]?.value).toBe("2");
    expect(viewModel.summaryCards[1]?.value).toBe("2");
    expect(viewModel.summaryCards[2]?.value).toBe("Max turns reached");
    expect(viewModel.timeSeriesRows).toHaveLength(8);
    expect(viewModel.timeSeriesRows[6]).toEqual({
      date: "2026-03-30",
      label: "Mar 30",
      totalFailures: 1,
      maxTurnsFailures: 1,
      startupFailures: 0,
      rateLimitedFailures: 0,
      providerTransientFailures: 0,
      otherFailures: 0
    });
    expect(viewModel.timeSeriesRows[7]).toEqual({
      date: "2026-03-31",
      label: "Mar 31",
      totalFailures: 1,
      maxTurnsFailures: 0,
      startupFailures: 1,
      rateLimitedFailures: 0,
      providerTransientFailures: 0,
      otherFailures: 0
    });
    expect(viewModel.hotspotRows[0]?.issueIdentifier).toBe("COL-165");
    expect(viewModel.hotspotRows[0]?.retries).toBe("1");
  });
});
