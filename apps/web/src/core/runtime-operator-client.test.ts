import { describe, expect, it, vi } from "vitest";
import {
  fetchRuntimeWorkflowObservability,
  fetchRuntimeIssue,
  submitRuntimeClarificationAnswer,
  requestRuntimeRefresh,
  shouldRefreshRuntimeIssue,
  shouldRefreshRuntimeWorkflowObservability
} from "./runtime-operator-client.js";
import {
  buildSymphonyRuntimeIssueResult,
  buildSymphonyRuntimeRefreshResult,
  buildSymphonyRuntimeWorkflowObservabilityResult
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
        pi: {
          selectedModel: "xiaomi/mimo-v2-pro"
        }
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

  it("submits clarification answers through the runtime operator API", async () => {
    const fetchAnswer = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: "1",
          ok: true,
          meta: {
            durationMs: 1,
            generatedAt: "2026-04-13T18:00:00.000Z"
          },
          data: {
            issueIdentifier: "COL-167",
            workflowId: "workflow-167",
            requestId: "clarification_167",
            answeredAt: "2026-04-13T18:00:00.000Z",
            capability: {
              workflowId: "workflow-167",
              contractId: "contract-167",
              policyId: "default",
              planKind: "execute",
              summary: "Next capability execution is implement.spec.",
              decidedAt: "2026-04-13T18:00:01.000Z",
              capabilityId: "implement.spec",
              modelProfileId: "builder_fast",
              workEpoch: 1,
              pendingClarification: null,
              completion: null
            }
          }
        })
      )
    );

    await expect(
      submitRuntimeClarificationAnswer(
        "https://runtime.symphony.local",
        "/api/v1/COL-167/clarification-answer",
        {
          requestId: "clarification_167",
          answers: {
            repo_scope: "Proceed with backend-only changes."
          }
        },
        fetchAnswer
      )
    ).resolves.toMatchObject({
      requestId: "clarification_167",
      capability: {
        planKind: "execute"
      }
    });
  });

  it("parses workflow observability envelopes", async () => {
    const fetchObservability = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: "1",
          ok: true,
          meta: {
            durationMs: 2,
            generatedAt: "2026-04-13T18:07:00.000Z"
          },
          data: buildSymphonyRuntimeWorkflowObservabilityResult()
        })
      )
    );

    await expect(
      fetchRuntimeWorkflowObservability(
        "https://runtime.symphony.local",
        "COL-167",
        {
          historyLimit: 50,
          decisionLimit: 20
        },
        fetchObservability
      )
    ).resolves.toMatchObject({
      workflow: {
        issueIdentifier: "COL-167"
      },
      snapshot: {
        currentNode: "implementation"
      },
      replay: {
        recordedDecisionCount: 1
      }
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

  it("treats missing workflow observability context as empty state", async () => {
    const fetchObservability = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 404
      })
    );

    await expect(
      fetchRuntimeWorkflowObservability(
        "https://runtime.symphony.local",
        "COL-106",
        {},
        fetchObservability
      )
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

  it("fails closed when clarification answer submission rejects", async () => {
    const fetchFailure = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 409
      })
    );

    await expect(
      submitRuntimeClarificationAnswer(
        "https://runtime.symphony.local",
        "/api/v1/COL-167/clarification-answer",
        {
          requestId: "clarification_167",
          answers: {
            repo_scope: "Proceed with backend-only changes."
          }
        },
        fetchFailure
      )
    ).rejects.toThrow("Clarification answer request failed with 409.");
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

  it("refreshes workflow observability only for matching invalidations", () => {
    expect(
      shouldRefreshRuntimeWorkflowObservability(
        {
          type: "issue.updated",
          channel: "issues",
          issueIdentifier: "COL-167",
          generatedAt: "2026-03-31T18:05:00.000Z",
          invalidate: [
            "/api/v1/COL-167/workflow-observability",
            "/api/v1/COL-167"
          ]
        },
        "COL-167"
      )
    ).toBe(true);
    expect(
      shouldRefreshRuntimeWorkflowObservability(
        {
          type: "issue.updated",
          channel: "issues",
          issueIdentifier: "COL-168",
          generatedAt: "2026-03-31T18:05:00.000Z",
          invalidate: ["/api/v1/COL-168/workflow-observability"]
        },
        "COL-167"
      )
    ).toBe(false);
  });
});
