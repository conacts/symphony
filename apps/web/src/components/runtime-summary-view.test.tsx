import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildOverviewSuccessMetricsViewModel } from "@/features/overview/model/overview-success-metrics";
import { OverviewView } from "@/features/overview/components/overview-view";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsSuccessMetricsResult,
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
        loading
        successMetrics={null}
        selectedTimeRange="7d"
        onTimeRangeChange={() => {}}
      />
    );

    expect(html).toContain('data-slot="skeleton"');
  });

  it("renders the operator-visible summary sections for a loaded snapshot", () => {
    const html = renderToStaticMarkup(
      <OverviewView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        loading={false}
        successMetrics={buildOverviewSuccessMetricsViewModel(
          buildSymphonyForensicsSuccessMetricsResult()
        )}
        selectedTimeRange="7d"
        onTimeRangeChange={() => {}}
      />
    );

    expect(html).toContain("Overview");
    expect(html).toContain("Time range");
    expect(html).toContain("Weekly throughput");
    expect(html).toContain("Delivered issues");
    expect(html).toContain("Delivery velocity");
    expect(html).toContain("Delivery retries");
  });
});
