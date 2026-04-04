import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PerformanceAnalysisView } from "@/features/analysis/components/performance-analysis-view";
import { buildPerformanceAnalysisViewModel } from "@/features/analysis/model/performance-analysis-view-model";
import {
  buildSymphonyCodexRunArtifactsResult,
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("performance analysis view", () => {
  it("renders command and tool performance surfaces", () => {
    const html = renderToStaticMarkup(
      <PerformanceAnalysisView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        loading={false}
        performanceAnalysis={buildPerformanceAnalysisViewModel({
          issueIndex: buildSymphonyForensicsIssueListResult(),
          sampledRuns: [
            {
              issueIdentifier: "COL-165",
              run: {
                ...buildSymphonyForensicsIssueListResult().issues[0]!,
                runId: "run_123"
              } as never,
              artifacts: buildSymphonyCodexRunArtifactsResult()
            }
          ]
        })}
      />
    );

    expect(html).toContain("Performance analysis");
    expect(html).toContain("Latency composition");
    expect(html).toContain("Slow turns");
    expect(html).toContain("Command family hotspots");
    expect(html).toContain("Tool call hotspots");
    expect(html).toContain("Execution hotspots");
  });
});
