import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuntimeSummaryView } from "./runtime-summary-view.js";

describe("runtime summary view", () => {
  it("renders loading placeholders before the first snapshot arrives", () => {
    const html = renderToStaticMarkup(
      <RuntimeSummaryView
        connection={{
          kind: "waiting",
          label: "Loading runtime snapshot",
          detail: "Fetching the first runtime summary snapshot."
        }}
        error={null}
        loading
        runtimeSummary={null}
      />
    );

    expect(html).toContain('data-slot="skeleton"');
  });

  it("renders the operator-visible summary sections for a loaded snapshot", () => {
    const html = renderToStaticMarkup(
      <RuntimeSummaryView
        connection={{
          kind: "connected",
          label: "Live updates connected",
          detail: "Runtime snapshot and websocket updates are active."
        }}
        error={null}
        loading={false}
        runtimeSummary={{
          metrics: [
            {
              label: "Running",
              value: "1",
              detail: "Active issue sessions in the current runtime."
            },
            {
              label: "Retrying",
              value: "1",
              detail: "Issues waiting for the next retry window."
            },
            {
              label: "Total tokens",
              value: "320",
              detail: "In 200 / Out 120"
            },
            {
              label: "Runtime",
              value: "1m 35s",
              detail: "Total Codex runtime reported by the current TypeScript runtime."
            }
          ],
          rateLimitsText: "{\n  \"remaining\": 3\n}",
          runningRows: [
            {
              issueIdentifier: "COL-165",
              state: "In Progress",
              sessionId: "session_123",
              runtimeAndTurns: "2m 0s / 4 turns",
              codexUpdate: "Runtime view updated · 2026-03-31T18:01:00.000Z",
              tokenSummary: "Total 200 · In 120 / Out 80"
            }
          ],
          retryRows: [
            {
              issueIdentifier: "COL-166",
              attempt: "2",
              dueAt: "2026-03-31T18:05:00.000Z",
              error: "Worker disconnected"
            }
          ]
        }}
      />
    );

    expect(html).toContain("Running sessions");
    expect(html).toContain("Retry queue");
    expect(html).toContain("Rate limits");
    expect(html).toContain("COL-165");
    expect(html).toContain("Worker disconnected");
  });
});
