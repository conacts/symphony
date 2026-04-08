import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueDetailResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { IssueDetailView } from "@/features/issues/components/issue-detail-view";

describe("issue detail view", () => {
  it("renders the issue run history drilldown", () => {
    const html = renderToStaticMarkup(
      <IssueDetailView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        issueDetail={buildSymphonyForensicsIssueDetailResult()}
        loading={false}
      />
    );

    expect(html).toContain("Recent run token load");
    expect(html).toContain("Run pressure");
    expect(html).toContain("Run history");
    expect(html).toContain("Status filter");
    expect(html).toContain("Model filter");
    expect(html).toContain('href="/issues/COL-165/runs/');
    expect(html.indexOf("Recent run token load")).toBeLessThan(html.indexOf("Run history"));
  });

  it("renders the degraded state when the issue request fails", () => {
    const html = renderToStaticMarkup(
      <IssueDetailView
        connection={buildSymphonyDashboardConnectionState()}
        error="issue unavailable"
        issueDetail={null}
        loading={false}
      />
    );

    expect(html).toContain("Issue detail degraded");
    expect(html).toContain("issue unavailable");
  });
});
