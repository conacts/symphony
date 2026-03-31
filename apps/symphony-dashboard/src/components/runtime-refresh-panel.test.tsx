import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RuntimeRefreshPanel } from "./runtime-refresh-panel.js";
import { buildSymphonyRuntimeRefreshResult } from "../test-support/build-symphony-runtime-operator.js";

describe("runtime refresh panel", () => {
  it("renders the admitted refresh delegation and success affordance", () => {
    const html = renderToStaticMarkup(
      <RuntimeRefreshPanel
        error={null}
        lastResult={buildSymphonyRuntimeRefreshResult()}
        onRefresh={vi.fn()}
        pending={false}
      />
    );

    expect(html).toContain("Refresh runtime now");
    expect(html).toContain("Delegates to poll");
    expect(html).toContain("Delegates to reconcile");
    expect(html).toContain("Refresh requested");
  });

  it("renders refresh failures without inventing hidden commands", () => {
    const html = renderToStaticMarkup(
      <RuntimeRefreshPanel
        error="Runtime refresh request failed with 503."
        lastResult={null}
        onRefresh={vi.fn()}
        pending={false}
      />
    );

    expect(html).toContain("Refresh failed");
    expect(html).toContain("503");
  });
});
