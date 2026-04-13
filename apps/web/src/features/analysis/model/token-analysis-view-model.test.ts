import { describe, expect, it } from "vitest";
import { buildTokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import {
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("token analysis view model", () => {
  it("aggregates token totals into summary and daily series rows", () => {
    const viewModel = buildTokenAnalysisViewModel({
      issueIndex: buildSymphonyForensicsIssueListResult(),
      sampledRuns: [
        {
          repositoryKey: "symphony",
          trackerIssueKey: "COL-165",
          run: {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            runId: "run_123",
            inputTokens: 120,
            outputTokens: 80,
            totalTokens: 200,
            startedAt: "2026-03-31T18:00:00.000Z"
          } as never,
          artifacts: buildSymphonyAgentRunArtifactsResult()
        },
        {
          repositoryKey: "symphony",
          trackerIssueKey: "COL-166",
          run: {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            runId: "run_456",
            trackerIssueKey: "COL-166",
            inputTokens: 500,
            outputTokens: 120,
            totalTokens: 620,
            startedAt: "2026-03-31T19:00:00.000Z"
          } as never,
          artifacts: buildSymphonyAgentRunArtifactsResult({
            run: {
              ...buildSymphonyAgentRunArtifactsResult().run,
              trackerIssueKey: "COL-166"
            },
            turns: [
              {
                ...buildSymphonyAgentRunArtifactsResult().turns[0]!,
                turnId: "turn_456",
                runId: "run_456",
                inputTokens: 400,
                cachedInputTokens: 100,
                outputTokens: 120,
                totalTokens: 620,
                usage: {
                  input_tokens: 400,
                  cached_input_tokens: 100,
                  output_tokens: 120
                }
              }
            ]
          })
        }
      ]
    });

    expect(viewModel.summaryCards[0]?.value).toBe("820");
    expect(viewModel.summaryCards[1]?.value).toBe("2");
    expect(viewModel.summaryCards[2]?.value).toBe("410");
    expect(viewModel.timeSeriesRows[0]).toEqual({
      date: "2026-03-31",
      label: "Mar 31",
      inputTokens: 520,
      cachedInputTokens: 100,
      outputTokens: 200,
      totalTokens: 820,
      runCount: 2
    });
    expect(viewModel.runTokenRows[0]?.totalTokens).toBe(620);
    expect(viewModel.turnTokenRows[0]?.totalTokens).toBe(620);
    expect(viewModel.issueTokenRows[0]?.trackerIssueKey).toBe("COL-166");
    expect(viewModel.spotlight.hottestIssue).toBe("COL-166");
  });
});
