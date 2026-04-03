import { describe, expect, it, vi } from "vitest";
import {
  buildSymphonyRuntimeHealthResult,
  buildSymphonyRuntimeLogsResult
} from "../test-support/symphony-runtime-builders.js";
import {
  fetchRuntimeHealth,
  fetchRuntimeLogs,
  shouldRefreshRuntimeHealth,
  shouldRefreshRuntimeLogs
} from "./runtime-observability-client.js";

describe("runtime observability client", () => {
  it("parses runtime health and logs envelopes", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: "1",
            ok: true,
            data: buildSymphonyRuntimeHealthResult(),
            meta: {
              durationMs: 1,
              generatedAt: "2026-03-31T18:05:00.000Z"
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: "1",
            ok: true,
            data: buildSymphonyRuntimeLogsResult(),
            meta: {
              durationMs: 1,
              generatedAt: "2026-03-31T18:05:00.000Z"
            }
          })
        )
      );

    await expect(
      fetchRuntimeHealth("https://runtime.symphony.local", fetchImpl)
    ).resolves.toMatchObject({
      healthy: true,
      db: {
        ready: true
      }
    });
    await expect(
      fetchRuntimeLogs("https://runtime.symphony.local", {}, fetchImpl)
    ).resolves.toMatchObject({
      logs: expect.arrayContaining([
        expect.objectContaining({
          eventType: "db_initialized"
        })
      ])
    });
  });

  it("refreshes health and logs on the expected realtime events", () => {
    expect(
      shouldRefreshRuntimeHealth({
        type: "runtime.snapshot.updated",
        channel: "runtime",
        generatedAt: "2026-03-31T18:05:00.000Z",
        invalidate: ["/api/v1/state"]
      })
    ).toBe(true);

    expect(
      shouldRefreshRuntimeLogs({
        type: "issue.updated",
        channel: "issues",
        issueIdentifier: "COL-165",
        generatedAt: "2026-03-31T18:05:00.000Z",
        invalidate: ["/api/v1/issues/COL-165"]
      })
    ).toBe(true);
  });
});
