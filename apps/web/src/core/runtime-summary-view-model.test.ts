import { describe, expect, it } from "vitest";
import { buildSymphonyRuntimeStateResult } from "../test-support/build-symphony-dashboard-view-fixtures.js";
import {
  buildRuntimeSummaryConnectionState,
  buildRuntimeSummaryViewModel,
  formatRuntimeSeconds
} from "@/features/overview/model/overview-view-model";

describe("runtime summary view model", () => {
  it("formats the operator-facing runtime metrics and rows", () => {
    const runtimeSummary = buildRuntimeSummaryViewModel(
      buildSymphonyRuntimeStateResult(),
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
    expect(runtimeSummary.tokenChartRows[0]).toEqual({
      issueIdentifier: "COL-165",
      inputTokens: 120,
      outputTokens: 80
    });
    expect(runtimeSummary.retryChartRows[0]).toEqual({
      issueIdentifier: "COL-166",
      attempt: 2
    });
    expect(runtimeSummary.rateLimitRows[0]).toEqual({
      label: "remaining",
      value: "3"
    });
  });

  it("describes operator-visible connection states", () => {
    expect(
      buildRuntimeSummaryConnectionState({
        status: "connecting",
        error: null,
        hasSnapshot: false
      }).label
    ).toBe("not connected");
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
