import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildFailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import { buildRuntimeSummaryViewModel } from "@/features/overview/model/overview-view-model";
import { OverviewView } from "@/features/overview/components/overview-view";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueListResult,
  buildSymphonyRuntimeStateResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";

describe("runtime summary view", () => {
  it("renders loading placeholders before the first snapshot arrives", () => {
    const html = renderToStaticMarkup(
      <OverviewView
        connection={buildSymphonyDashboardConnectionState({
          kind: "waiting",
          label: "Loading runtime snapshot",
          detail: "Fetching the first runtime summary snapshot."
        })}
        error={null}
        failureAnalysis={null}
        failureAnalysisError={null}
        loading
        runtimeSummary={null}
      />
    );

    expect(html).toContain('data-slot="skeleton"');
  });

  it("renders the operator-visible summary sections for a loaded snapshot", () => {
    const html = renderToStaticMarkup(
      <OverviewView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        failureAnalysis={buildFailureAnalysisViewModel(
          buildSymphonyForensicsIssueListResult()
        )}
        failureAnalysisError={null}
        loading={false}
        runtimeSummary={buildRuntimeSummaryViewModel(
          buildSymphonyRuntimeStateResult(),
          new Date("2026-03-31T18:02:00.000Z")
        )}
      />
    );

    expect(html).toContain("Overview");
    expect(html).toContain("Active token footprint");
    expect(html).toContain("Retry attempt queue");
    expect(html).toContain("Retry pressure");
    expect(html).toContain("Provider headroom");
    expect(html).toContain("Failure analysis");
    expect(html).toContain("Open failure analysis");
    expect(html).toContain("Active runs");
    expect(html).toContain("COL-165");
    expect(html).toContain("Worker disconnected");
  });
});
