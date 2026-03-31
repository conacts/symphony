import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssueRequeuePanel } from "./issue-requeue-panel.js";
import { buildSymphonyRuntimeIssueResult } from "../test-support/build-symphony-runtime-operator.js";

describe("issue requeue panel", () => {
  it("renders parity-safe requeue affordances", () => {
    const html = renderToStaticMarkup(
      <IssueRequeuePanel
        error={null}
        issue={buildSymphonyRuntimeIssueResult()}
        loading={false}
      />
    );

    expect(html).toContain("Open in Linear");
    expect(html).toContain("Open GitHub PR search");
    expect(html).toContain("/rework");
    expect(html).toContain("Delegates to Linear");
    expect(html).toContain("Delegates to GitHub /rework");
  });

  it("renders operator context failures", () => {
    const html = renderToStaticMarkup(
      <IssueRequeuePanel
        error="Runtime issue request failed with 404."
        issue={null}
        loading={false}
      />
    );

    expect(html).toContain("Runtime issue context unavailable");
    expect(html).toContain("404");
  });
});
