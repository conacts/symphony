import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueListResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { IssueIndexView } from "./issue-index-view.js";

describe("issue index view", () => {
  it("renders the issue drilldown table", () => {
    const html = renderToStaticMarkup(
      <IssueIndexView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        issueIndex={buildSymphonyForensicsIssueListResult()}
        loading={false}
        onQueryChange={() => {}}
        query={{
          timeRange: "all",
          sortBy: "lastActive",
          sortDirection: "desc"
        }}
        runtimeBaseUrl="http://localhost:4100"
      />
    );

    expect(html).toContain("Issues");
    expect(html).toContain("COL-165");
    expect(html).toContain("Historical process forensics");
    expect(html).toContain("max_turns");
    expect(html).toContain("Total issues");
  });
});
