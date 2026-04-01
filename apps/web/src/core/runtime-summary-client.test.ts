import { describe, expect, it, vi } from "vitest";
import { buildSymphonyRuntimeStateResult } from "@symphony/test-support";
import {
  fetchRuntimeSummary,
  parseRealtimeServerMessage,
  serializeRealtimeClientMessage,
  shouldRefreshRuntimeSummary
} from "./runtime-summary-client.js";

describe("runtime summary client", () => {
  it("parses the admitted runtime summary envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: "1",
        ok: true,
        data: buildSymphonyRuntimeStateResult(),
        meta: {
          durationMs: 2,
          generatedAt: "2026-03-31T18:01:00.000Z"
        }
      })
    });

    const runtimeSummary = await fetchRuntimeSummary(
      "http://127.0.0.1:4400/api/v1/state",
      fetchImpl as typeof fetch
    );

    expect(runtimeSummary.counts.running).toBe(1);
    expect(runtimeSummary.running[0]?.issueIdentifier).toBe("COL-165");
    expect(runtimeSummary.retrying[0]?.attempt).toBe(2);
    expect(runtimeSummary.codexTotals.totalTokens).toBe(320);
  });

  it("serializes runtime channel subscriptions", () => {
    const message = serializeRealtimeClientMessage({
      type: "subscribe",
      channels: ["runtime"]
    });

    expect(message).toBe('{"type":"subscribe","channels":["runtime"]}');
  });

  it("refreshes only on runtime snapshot invalidations", () => {
    const runtimeMessage = parseRealtimeServerMessage(
      JSON.stringify({
        type: "runtime.snapshot.updated",
        channel: "runtime",
        generatedAt: "2026-03-31T18:00:00.000Z",
        invalidate: ["/api/v1/state"]
      })
    );
    const issueMessage = parseRealtimeServerMessage(
      JSON.stringify({
        type: "issue.updated",
        channel: "issues",
        issueIdentifier: "COL-165",
        generatedAt: "2026-03-31T18:00:00.000Z",
        invalidate: ["/api/v1/issues/COL-165"]
      })
    );

    expect(runtimeMessage).not.toBeNull();
    expect(issueMessage).not.toBeNull();
    expect(shouldRefreshRuntimeSummary(runtimeMessage!)).toBe(true);
    expect(shouldRefreshRuntimeSummary(issueMessage!)).toBe(false);
  });
});
