import { describe, expect, it, vi } from "vitest";
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
        data: {
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
