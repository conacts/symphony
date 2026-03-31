import { describe, expect, it } from "vitest";
import {
  buildRuntimeSummaryConnectionState,
  buildRuntimeSummaryViewModel,
  formatRuntimeSeconds
} from "./runtime-summary-view-model.js";

describe("runtime summary view model", () => {
  it("formats the operator-facing runtime metrics and rows", () => {
    const runtimeSummary = buildRuntimeSummaryViewModel(
      {
        counts: {
          running: 1,
          retrying: 1
        },
        running: [
          {
            issueId: "issue_123",
            issueIdentifier: "COL-165",
            state: "In Progress",
            workerHost: "worker-a",
            workspacePath: "/tmp/workspaces/col-165",
            sessionId: "session_123",
            turnCount: 4,
            lastEvent: "message.output",
            lastMessage: "Runtime view updated",
            startedAt: "2026-03-31T18:00:00.000Z",
            lastEventAt: "2026-03-31T18:01:00.000Z",
            tokens: {
              inputTokens: 120,
              outputTokens: 80,
              totalTokens: 200
            }
          }
        ],
        retrying: [
          {
            issueId: "issue_456",
            issueIdentifier: "COL-166",
            attempt: 2,
            dueAt: "2026-03-31T18:05:00.000Z",
            error: "Worker disconnected",
            workerHost: "worker-b",
            workspacePath: "/tmp/workspaces/col-166"
          }
        ],
        codexTotals: {
          inputTokens: 200,
          outputTokens: 120,
          totalTokens: 320,
          secondsRunning: 95
        },
        rateLimits: {
          remaining: 3
        }
      },
      new Date("2026-03-31T18:02:00.000Z")
    );

    expect(runtimeSummary.metrics[0]).toEqual({
      label: "Running",
      value: "1",
      detail: "Active issue sessions in the current runtime."
    });
    expect(runtimeSummary.metrics[3]?.value).toBe("1m 35s");
    expect(runtimeSummary.runningRows[0]?.runtimeAndTurns).toBe("2m 0s / 4 turns");
    expect(runtimeSummary.retryRows[0]?.error).toBe("Worker disconnected");
    expect(runtimeSummary.rateLimitsText).toContain('"remaining": 3');
  });

  it("describes operator-visible connection states", () => {
    expect(
      buildRuntimeSummaryConnectionState({
        status: "connecting",
        error: null,
        hasSnapshot: false
      }).label
    ).toBe("Loading runtime snapshot");
    expect(
      buildRuntimeSummaryConnectionState({
        status: "connected",
        error: null,
        hasSnapshot: true
      }).kind
    ).toBe("connected");
    expect(
      buildRuntimeSummaryConnectionState({
        status: "degraded",
        error: "Socket closed",
        hasSnapshot: true
      }).detail
    ).toBe("Socket closed");
  });

  it("formats runtime durations with readable units", () => {
    expect(formatRuntimeSeconds(12)).toBe("12s");
    expect(formatRuntimeSeconds(75)).toBe("1m 15s");
    expect(formatRuntimeSeconds(3_725)).toBe("1h 2m 5s");
  });
});
