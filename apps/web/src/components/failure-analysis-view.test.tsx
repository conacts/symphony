import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FailureAnalysisView } from "@/features/analysis/components/failure-analysis-view";
import { buildFailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("failure analysis view", () => {
  it("renders the cross-run failure analysis surfaces", () => {
    const html = renderToStaticMarkup(
      <FailureAnalysisView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        loading={false}
        failureAnalysis={buildFailureAnalysisViewModel(
          buildSymphonyForensicsIssueListResult()
        )}
      />
    );

    expect(html).toContain("Failure analysis");
    expect(html).toContain("Current failure modes");
    expect(html).toContain("Error classes");
    expect(html).toContain("Failure hotspots");
    expect(html).toContain('href="/issues/COL-165"');
  });
});
