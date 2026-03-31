import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueDetailResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { IssueDetailView } from "./issue-detail-view.js";

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

    expect(html).toContain("Run history");
    expect(html).toContain("run_1234");
    expect(html).toContain("completed");
  });
});
