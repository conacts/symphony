import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsRunDetailResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { RunDetailView } from "./run-detail-view.js";

describe("run detail view", () => {
  it("renders the run metrics and flat turns table", () => {
    const html = renderToStaticMarkup(
      <RunDetailView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        loading={false}
        runDetail={buildSymphonyForensicsRunDetailResult()}
      />
    );

    expect(html).toContain("COL-165");
    expect(html).toContain("Repo start");
    expect(html).toContain("Turns");
    expect(html).toContain("Session");
    expect(html).toContain("Turn");
    expect(html).toContain("View payload");
  });
});
