import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueForensicsBundleResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { IssueDetailView } from "./issue-detail-view.js";

describe("issue detail view", () => {
  it("renders the issue run history drilldown", () => {
    const html = renderToStaticMarkup(
      <IssueDetailView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        issueDetail={buildSymphonyForensicsIssueForensicsBundleResult()}
        loading={false}
      />
    );

    expect(html).toContain("Run history");
    expect(html).toContain("Latest failure");
    expect(html).toContain("Issue timeline");
    expect(html).toContain("Runtime logs");
  });
});
