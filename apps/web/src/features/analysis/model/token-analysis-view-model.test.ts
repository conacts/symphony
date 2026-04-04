import { describe, expect, it } from "vitest";
import { buildTokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import {
  buildSymphonyCodexRunArtifactsResult,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("token analysis view model", () => {
  it("aggregates run and turn token hotspots from sampled runs", () => {
    const viewModel = buildTokenAnalysisViewModel({
      issueIndex: buildSymphonyForensicsIssueListResult(),
      sampledRuns: [
        {
          issueIdentifier: "COL-165",
          run: {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            runId: "run_123",
            inputTokens: 120,
            outputTokens: 80,
            totalTokens: 200,
            startedAt: "2026-03-31T18:00:00.000Z"
          } as never,
          artifacts: buildSymphonyCodexRunArtifactsResult()
        },
        {
          issueIdentifier: "COL-166",
          run: {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            runId: "run_456",
            issueIdentifier: "COL-166",
            inputTokens: 500,
            outputTokens: 120,
            totalTokens: 620,
            startedAt: "2026-03-31T19:00:00.000Z"
          } as never,
          artifacts: buildSymphonyCodexRunArtifactsResult({
            run: {
              ...buildSymphonyCodexRunArtifactsResult().run,
              issueIdentifier: "COL-166"
            },
            turns: [
              {
                ...buildSymphonyCodexRunArtifactsResult().turns[0]!,
                turnId: "turn_456",
                runId: "run_456",
                inputTokens: 400,
                cachedInputTokens: 100,
                outputTokens: 120,
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

    expect(viewModel.summaryCards[0]?.value).toBe("2");
    expect(viewModel.tokenCards[0]?.value).toBe("410");
    expect(viewModel.runTokenRows[0]?.totalTokens).toBe(620);
    expect(viewModel.turnTokenRows[0]?.totalTokens).toBe(520);
    expect(viewModel.issueTokenRows[0]?.issueIdentifier).toBe("COL-166");
    expect(viewModel.spotlight.hottestIssue).toBe("COL-166");
  });
});
