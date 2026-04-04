import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueForensicsBundleResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { IssueActivityView } from "./issue-activity-view.js";

describe("issue activity view", () => {
  it("renders the unified issue activity stream", () => {
    const html = renderToStaticMarkup(
      <IssueActivityView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        issueActivity={buildSymphonyForensicsIssueForensicsBundleResult()}
        issueIdentifier="COL-165"
        loading={false}
      />
    );

    expect(html).toContain("Issue activity");
    expect(html).toContain("Chronological event feed");
    expect(html).toContain("Latest failure");
    expect(html).toContain("runtime:workspace");
    expect(html).toContain("Approaching upstream rate limit.");
    expect(html).toContain("/issues/COL-165");
  });
});
