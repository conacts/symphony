import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FailureAnalysisView } from "@/features/analysis/components/failure-analysis-view";
import { buildFailureAnalysisViewModelFromSample } from "@/features/analysis/model/failure-analysis-view-model";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("failure analysis view", () => {
  it("renders the chart-first failure analysis surface", () => {
    const html = renderToStaticMarkup(
      <FailureAnalysisView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        loading={false}
        failureAnalysis={buildFailureAnalysisViewModelFromSample({
          issueIndex: buildSymphonyForensicsIssueListResult(),
          sampledRuns: []
        })}
        timeRange="7d"
        onModelChange={() => {}}
        onTimeRangeChange={() => {}}
      />
    );

    expect(html).toContain("Failure analysis");
    expect(html).toContain("Failure type by day");
    expect(html).toContain("Failed runs");
    expect(html).not.toContain("Failure hotspots");
    expect(html).not.toContain("Current failure modes");
  });
});
