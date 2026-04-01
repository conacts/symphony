import { describe, expect, it, vi } from "vitest";
import {
  fetchRuntimeIssue,
  requestRuntimeRefresh,
  shouldRefreshRuntimeIssue
} from "./runtime-operator-client.js";
import {
  buildSymphonyRuntimeIssueResult,
  buildSymphonyRuntimeRefreshResult
} from "../test-support/build-symphony-runtime-operator.js";

describe("runtime operator client", () => {
  it("parses the runtime issue and refresh envelopes", async () => {
    const fetchIssue = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: "1",
          ok: true,
          meta: {
            durationMs: 2,
            generatedAt: "2026-03-31T18:05:00.000Z"
          },
          data: buildSymphonyRuntimeIssueResult()
        })
      )
    );
    const fetchRefresh = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: "1",
          ok: true,
          meta: {
            durationMs: 1,
            generatedAt: "2026-03-31T18:05:00.000Z"
          },
          data: buildSymphonyRuntimeRefreshResult()
        })
      )
    );

    await expect(
      fetchRuntimeIssue("https://runtime.symphony.local", "COL-167", fetchIssue)
    ).resolves.toMatchObject({
      issueIdentifier: "COL-167",
      operator: {
        requeueCommand: "/rework"
      }
    });
    await expect(
      requestRuntimeRefresh(
        "https://runtime.symphony.local/api/v1/refresh",
        fetchRefresh
      )
    ).resolves.toMatchObject({
      operations: ["poll", "reconcile"]
    });
  });

  it("treats missing runtime issue context as empty state", async () => {
    const fetchIssue = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 404
      })
    );

    await expect(
      fetchRuntimeIssue("https://runtime.symphony.local", "COL-106", fetchIssue)
    ).resolves.toBeNull();
  });

  it("fails closed when the runtime actions reject", async () => {
    const fetchFailure = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 503
      })
    );

    await expect(
      requestRuntimeRefresh(
        "https://runtime.symphony.local/api/v1/refresh",
        fetchFailure
      )
    ).rejects.toThrow("Runtime refresh request failed with 503.");
  });

  it("refreshes runtime issue state only for matching invalidations", () => {
    expect(
      shouldRefreshRuntimeIssue(
        {
          type: "issue.updated",
          channel: "issues",
          issueIdentifier: "COL-167",
          generatedAt: "2026-03-31T18:05:00.000Z",
          invalidate: ["/api/v1/COL-167", "/api/v1/issues/COL-167"]
        },
        "COL-167"
      )
    ).toBe(true);
    expect(
      shouldRefreshRuntimeIssue(
        {
          type: "issue.updated",
          channel: "issues",
          issueIdentifier: "COL-168",
          generatedAt: "2026-03-31T18:05:00.000Z",
          invalidate: ["/api/v1/COL-168", "/api/v1/issues/COL-168"]
        },
        "COL-167"
      )
    ).toBe(false);
  });
});
