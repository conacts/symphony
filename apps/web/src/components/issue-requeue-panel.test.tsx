import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssueRequeuePanel } from "@/features/issues/components/issue-requeue-panel";
import { buildSymphonyRuntimeIssueResult } from "../test-support/build-symphony-runtime-operator.js";

describe("issue requeue panel", () => {
  it("renders parity-safe requeue affordances", () => {
    const html = renderToStaticMarkup(
      <IssueRequeuePanel
        error={null}
        issue={buildSymphonyRuntimeIssueResult()}
        issueIdentifier="COL-167"
        loading={false}
      />
    );

    expect(html).toContain("COL-167");
    expect(html).toContain("Linear");
    expect(html).toContain("GitHub");
    expect(html).toContain("gpt-5.4");
    expect(html).toContain("Model override helper");
    expect(html).toContain("No label required");
  });

  it("renders operator context failures", () => {
    const html = renderToStaticMarkup(
      <IssueRequeuePanel
        error="Runtime issue request failed with 404."
        issue={null}
        issueIdentifier="COL-167"
        loading={false}
      />
    );

    expect(html).toContain("Runtime issue context unavailable");
    expect(html).toContain("404");
  });
});
