import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssueRequeuePanel } from "@/features/issues/components/issue-requeue-panel";
import { buildSymphonyForensicsIssueDetailResult } from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { buildSymphonyRuntimeIssueResult } from "../test-support/build-symphony-runtime-operator.js";

describe("issue requeue panel", () => {
  it("renders parity-safe requeue affordances", () => {
    const html = renderToStaticMarkup(
      <IssueRequeuePanel
        error={null}
        issueDetail={buildSymphonyForensicsIssueDetailResult()}
        issue={buildSymphonyRuntimeIssueResult()}
        issueIdentifier="COL-167"
        loading={false}
      />
    );

    expect(html).toContain("COL-167");
    expect(html).toContain("Linear");
    expect(html).toContain("GitHub");
    expect(html).toContain("Timeline");
    expect(html).toContain('/issues/COL-167/timeline?repo=symphony');
    expect(html).toContain("In Progress");
    expect(html).toContain("xiaomi/mimo-v2-pro");
    expect(html).toContain("Last run");
  });

  it("renders operator context failures", () => {
    const html = renderToStaticMarkup(
      <IssueRequeuePanel
        error="Runtime issue request failed with 404."
        issueDetail={null}
        issue={null}
        issueIdentifier="COL-167"
        loading={false}
      />
    );

    expect(html).toContain("Runtime issue context unavailable");
    expect(html).toContain("404");
  });
});
