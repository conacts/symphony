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
  it("renders the condensed runtime diagnostics layout", () => {
    const html = renderToStaticMarkup(
      <RuntimeHealthView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        health={buildSymphonyRuntimeHealthResult()}
        runtimeLogs={buildSymphonyRuntimeLogsResult({
          logs: [
            ...buildSymphonyRuntimeLogsResult().logs,
            {
              entryId: "runtime-log-3",
              repositoryKey: "symphony",
              level: "info",
              source: "poller",
              eventType: "cycle_started",
              message: "Poller cycle started.",
              issueId: null,
              issueIdentifier: null,
              runId: null,
              payload: null,
              recordedAt: "2026-03-31T18:02:00.000Z"
            },
            {
              entryId: "runtime-log-4",
              repositoryKey: "symphony",
              level: "debug",
              source: "runtime",
              eventType: "task_queue_state",
              message: "Queue state refreshed.",
              issueId: "issue_123",
              issueIdentifier: "COL-165",
              runId: "run_123",
              payload: { state: "idle" },
              recordedAt: "2026-03-31T18:03:00.000Z"
            },
            {
              entryId: "runtime-log-5",
              repositoryKey: "symphony",
              level: "warn",
              source: "worker",
              eventType: "worker_connection_retry",
              message: "Worker reconnected after retry.",
              issueId: "issue_456",
              issueIdentifier: "COL-166",
              runId: "run_456",
              payload: null,
              recordedAt: "2026-03-31T18:04:00.000Z"
            },
            {
              entryId: "runtime-log-6",
              repositoryKey: "symphony",
              level: "error",
              source: "runtime",
              eventType: "runtime_snapshot_failed",
              message: "Runtime snapshot failed to refresh.",
              issueId: null,
              issueIdentifier: null,
              runId: null,
              payload: { reason: "timeout" },
              recordedAt: "2026-03-31T18:05:00.000Z"
            }
          ]
        })}
        loading={false}
        now={new Date("2026-03-31T18:04:05.000Z")}
      />
    );

    expect(html).toContain("Runtime health");
    expect(html).toContain("Recent event pressure");
    expect(html).toContain("Machine pressure");
    expect(html).toContain("Heartbeat");
    expect(html).toContain("Runtime incidents");
    expect(html).toContain("Recent runtime events");
    expect(html).toContain("Page 1 of 2");
    expect(html).toContain("Showing 1-5 of 6 events.");
    expect(html).toContain("/tmp/symphony.db");
    expect(html).not.toContain("Runtime storage and cadence");
    expect(html).not.toContain("Machine load");
  });
});
