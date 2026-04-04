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
        issueIdentifier="COL-165"
        loading={false}
      />
    );

    expect(html).toContain("Issue runs");
    expect(html).toContain("Run outcomes");
    expect(html).toContain("Recent run token load");
    expect(html).toContain("Run history");
    expect(html).toContain("Issue activity");
    expect(html).toContain("/issues/COL-165/timeline");
    expect(html).toContain('href="/runs/');
  });
});
