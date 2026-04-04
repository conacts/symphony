import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TokenAnalysisView } from "@/features/analysis/components/token-analysis-view";
import { buildTokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import {
  buildSymphonyCodexRunArtifactsResult,
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("token analysis view", () => {
  it("renders cross-run token analysis surfaces", () => {
    const html = renderToStaticMarkup(
      <TokenAnalysisView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        loading={false}
        tokenAnalysis={buildTokenAnalysisViewModel({
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
            }
          ]
        })}
      />
    );

    expect(html).toContain("Token analysis");
    expect(html).toContain("Run token load");
    expect(html).toContain("Turn token load");
    expect(html).toContain("Issue token pressure");
    expect(html).toContain("Token hotspots");
  });
});
