import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuntimeHealthView } from "@/features/runtime/components/runtime-health-view";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyRuntimeHealthResult,
  buildSymphonyRuntimeLogsResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";

describe("runtime health view", () => {
  it("renders the runtime diagnostics layout", () => {
    const html = renderToStaticMarkup(
      <RuntimeHealthView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        health={buildSymphonyRuntimeHealthResult()}
        runtimeLogs={buildSymphonyRuntimeLogsResult()}
        loading={false}
      />
    );

    expect(html).toContain("Runtime health");
    expect(html).toContain("Recent event pressure");
    expect(html).toContain("Active incidents");
    expect(html).toContain("Health signals");
    expect(html).toContain("Scheduler heartbeat");
    expect(html).toContain("Runtime storage and cadence");
    expect(html).toContain("Recent runtime events");
    expect(html).toContain("/tmp/symphony.db");
  });
});
