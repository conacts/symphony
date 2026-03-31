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
      />
    );

    expect(html).toContain("Issue index");
    expect(html).toContain("COL-165");
    expect(html).toContain("Issue detail");
    expect(html).toContain("max_turns");
  });
});
