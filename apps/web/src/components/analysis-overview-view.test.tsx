import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalysisOverviewView } from "@/features/analysis/components/analysis-overview-view";
import { buildAnalysisOverviewViewModel } from "@/features/analysis/model/analysis-overview-view-model";
import { buildFailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import { buildPerformanceAnalysisViewModel } from "@/features/analysis/model/performance-analysis-view-model";
import { buildTokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import {
  buildSymphonyCodexRunArtifactsResult,
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("analysis overview view", () => {
  it("renders links into the dedicated analysis pages", () => {
    const issueIndex = buildSymphonyForensicsIssueListResult();
    const sample = {
      issueIndex,
      sampledRuns: [
        {
          issueIdentifier: "COL-165",
          run: {
            ...issueIndex.issues[0]!,
            runId: "run_123",
            inputTokens: 120,
            outputTokens: 80,
            totalTokens: 200,
            startedAt: "2026-03-31T18:00:00.000Z"
          } as never,
          artifacts: buildSymphonyCodexRunArtifactsResult()
        }
      ]
    };
    const html = renderToStaticMarkup(
      <AnalysisOverviewView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        loading={false}
        overview={buildAnalysisOverviewViewModel({
          failureAnalysis: buildFailureAnalysisViewModel(issueIndex),
          performanceAnalysis: buildPerformanceAnalysisViewModel(sample),
          tokenAnalysis: buildTokenAnalysisViewModel(sample)
        })}
      />
    );

    expect(html).toContain("Analysis overview");
    expect(html).toContain("Failure analysis");
    expect(html).toContain("Performance analysis");
    expect(html).toContain("Token analysis");
    expect(html).toContain('href="/analysis/failures"');
    expect(html).toContain('href="/analysis/performance"');
    expect(html).toContain('href="/analysis/tokens"');
  });
});
