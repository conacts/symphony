import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TokenAnalysisView } from "@/features/analysis/components/token-analysis-view";
import { buildTokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import {
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("token analysis view", () => {
  it("renders the dense token analysis surfaces", () => {
    const html = renderToStaticMarkup(
      <TokenAnalysisView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        loading={false}
        tokenAnalysis={buildTokenAnalysisViewModel({
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
            }
          ]
        })}
        modelOptions={[
          {
            value: "xiaomi/mimo-v2-pro",
            label: "xiaomi/mimo-v2-pro"
          }
        ]}
        timeRange="7d"
        onModelChange={() => {}}
        onTimeRangeChange={() => {}}
      />
    );

    expect(html).toContain("Token analysis");
    expect(html).toContain("Run token load");
    expect(html).toContain("Issue concentration");
    expect(html).toContain("Total tokens");
  });
});
