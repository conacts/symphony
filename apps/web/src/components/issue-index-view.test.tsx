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
    expect(html).toContain("Codex-native issue inventory");
    expect(html).toContain("Most active issue");
    expect(html).toContain("Issue outcome pressure");
    expect(html).toContain("Retry and failure pressure");
    expect(html).toContain("Issue inventory");
    expect(html).toContain("Reached max turns before completion.");
    expect(html).toContain("Total issues");
  });
});
