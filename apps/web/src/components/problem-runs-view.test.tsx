import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsProblemRunsResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { ProblemRunsView } from "./problem-runs-view.js";

describe("problem-runs view", () => {
  it("renders the filter form and problem-runs table", () => {
    const html = renderToStaticMarkup(
      <ProblemRunsView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        loading={false}
        problemRuns={buildSymphonyForensicsProblemRunsResult()}
      />
    );

    expect(html).toContain("Apply");
    expect(html).toContain("Problem runs");
    expect(html).toContain("COL-165");
    expect(html).toContain("max_turns");
  });
});
