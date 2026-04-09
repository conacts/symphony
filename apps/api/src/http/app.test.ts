import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  buildSymphonyTrackerIssue,
  buildSymphonyGitHubIssueCommentPayload,
  buildSymphonyGitHubPullRequestReviewCommentPayload,
  buildSymphonyGitHubPullRequestReviewPayload,
  signSymphonyGitHubWebhook
} from "@symphony/test-support";
import { runtimeReworkHandoffEventType } from "@symphony/runtime-contract";
import type { MemorySymphonyTracker } from "@symphony/tracker";
import { createSymphonyRuntimeApp } from "./app.js";
import type { SymphonyRuntimeTestHarness } from "../test-support/create-symphony-runtime-test-harness.js";
import {
  createSymphonyRuntimeAppServicesHarness,
  type SymphonyRuntimeAppServicesHarness
} from "../test-support/create-symphony-runtime-app-services-harness.js";
import { createSymphonyRuntimeTestHarness } from "../test-support/create-symphony-runtime-test-harness.js";

const harnesses: Array<
  SymphonyRuntimeTestHarness | SymphonyRuntimeAppServicesHarness
> = [];
const runtimeHttpIntegrationTestTimeoutMs = 30_000;

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("@symphony/api app", () => {
  it(
    "boots the http app against real runtime service wiring",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness();
      harnesses.push(harness);

      const app = createSymphonyRuntimeApp(harness.services);
      const stateResponse = await app.request("/api/v1/state");
      const healthResponse = await app.request("/api/v1/health");
      const refreshResponse = await app.request("/api/v1/refresh", {
        method: "POST"
      });
      const statePayload = await responseJson<{
        data: {
          counts: {
            running: number;
            retrying: number;
          };
        };
      }>(stateResponse);
      const healthPayload = await responseJson<{
        data: {
          healthy: boolean;
        };
      }>(healthResponse);
      const refreshPayload = await responseJson<{
        data: {
          queued: boolean;
        };
      }>(refreshResponse);

      expect(stateResponse.status).toBe(200);
      expect(statePayload.data.counts).toEqual({
        running: 0,
        retrying: 0
      });

      expect(healthResponse.status).toBe(200);
      expect(healthPayload.data.healthy).toBe(true);

      expect(refreshResponse.status).toBe(202);
      expect(refreshPayload.data.queued).toBe(true);
    },
    runtimeHttpIntegrationTestTimeoutMs
  );

  it("serves the runtime state and refresh surfaces", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review",
        teamKey: "COL",
        projectId: "project-1"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const stateResponse = await app.request("/api/v1/state");
    const refreshResponse = await app.request("/api/v1/refresh", {
      method: "POST"
    });
    const statePayload = await responseJson<{
      data: {
        running: Array<{
          threadId: string | null;
        }>;
      };
    }>(stateResponse);
    const refreshPayload = await responseJson<{
      data: {
        queued: boolean;
        coalesced: boolean;
        operations: [string, string];
      };
    }>(refreshResponse);

    expect(stateResponse.status).toBe(200);
    expect(statePayload.data.running[0]?.threadId).toBe("thread-live");

    expect(refreshResponse.status).toBe(202);
    expect(refreshPayload.data.queued).toBe(true);
    expect(refreshPayload.data.coalesced).toBe(false);
    expect(refreshPayload.data.operations).toEqual(["poll", "reconcile"]);
  });

  describe("read surfaces", () => {
    let harness: SymphonyRuntimeTestHarness;
    let app: ReturnType<typeof createSymphonyRuntimeApp>;

    beforeAll(async () => {
      harness = await createSymphonyRuntimeTestHarness({
        issue: {
          state: "In Review"
        }
      });
      app = createSymphonyRuntimeApp(harness.services);
    });

    afterAll(async () => {
      await harness.cleanup();
    });

    it("serves issue, forensics, and run summary routes", async () => {
      const issuesResponse = await app.request("/api/v1/issues");
      const issueDetailResponse = await app.request("/api/v1/issues/COL-123");
      const issueBundleResponse = await app.request(
        "/api/v1/issues/COL-123/forensics-bundle"
      );
      const successMetricsResponse = await app.request("/api/v1/success-metrics");
      const runDetailResponse = await app.request("/api/v1/runs/run-123");
      const problemRunsResponse = await app.request("/api/v1/problem-runs");
      const issuesPayload = await responseJson<{
        data: {
          issues: Array<{
            issueIdentifier: string;
          }>;
          totals: {
            issueCount: number;
          };
        };
      }>(issuesResponse);
      const issueDetailPayload = await responseJson<{
        data: {
          issueIdentifier: string;
        };
      }>(issueDetailResponse);
      const issueBundlePayload = await responseJson<{
        data: {
          issue: {
            issueIdentifier: string;
          };
          recentRuns: unknown[];
        };
      }>(issueBundleResponse);
      const successMetricsPayload = await responseJson<{
        data: {
          executive: {
            startedIssueCount: number;
            deliveredIssueCount: number;
          };
          daily: Array<{
            date: string;
          }>;
        };
      }>(successMetricsResponse);
      const runDetailPayload = await responseJson<{
        data: {
          run: {
            runId: string;
          };
        };
      }>(runDetailResponse);
      const problemRunsPayload = await responseJson<{
        data: {
          problemRuns: unknown[];
        };
      }>(problemRunsResponse);

      expect(issuesResponse.status).toBe(200);
      expect(issuesPayload.data.issues[0]?.issueIdentifier).toBe("COL-123");
      expect(issuesPayload.data.totals.issueCount).toBeGreaterThanOrEqual(1);

      expect(issueDetailResponse.status).toBe(200);
      expect(issueDetailPayload.data.issueIdentifier).toBe("COL-123");

      expect(issueBundleResponse.status).toBe(200);
      expect(issueBundlePayload.data.issue.issueIdentifier).toBe("COL-123");
      expect(Array.isArray(issueBundlePayload.data.recentRuns)).toBe(true);

      expect(successMetricsResponse.status).toBe(200);
      expect(successMetricsPayload.data.executive.startedIssueCount).toBeGreaterThan(0);
      expect(
        successMetricsPayload.data.executive.deliveredIssueCount
      ).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(successMetricsPayload.data.daily)).toBe(true);

      expect(runDetailResponse.status).toBe(200);
      expect(runDetailPayload.data.run.runId).toBe("run-123");

      expect(problemRunsResponse.status).toBe(200);
      expect(Array.isArray(problemRunsPayload.data.problemRuns)).toBe(true);
    });

    it("serves agent analytics routes", async () => {
      const codexArtifactsResponse = await app.request(
        "/api/v1/agent/runs/run-123/artifacts"
      );
      const codexOverflowResponse = await app.request(
        "/api/v1/agent/runs/run-123/overflow/item-123-overflow"
      );
      const codexTurnsResponse = await app.request("/api/v1/agent/runs/run-123/turns");
      const codexItemsResponse = await app.request(
        "/api/v1/agent/runs/run-123/items?turnId=turn-123"
      );
      const codexItemsAllTurnsResponse = await app.request(
        "/api/v1/agent/runs/run-123/items"
      );
      const codexAgentMessagesResponse = await app.request(
        "/api/v1/agent/runs/run-123/agent-messages?turnId=turn-123"
      );
      const codexCommandExecutionsResponse = await app.request(
        "/api/v1/agent/runs/run-123/command-executions"
      );
      const missingCodexArtifactsResponse = await app.request(
        "/api/v1/agent/runs/run-missing/artifacts"
      );
      const missingCodexOverflowResponse = await app.request(
        "/api/v1/agent/runs/run-123/overflow/overflow-missing"
      );
      const codexArtifactsPayload = await responseJson<{
        data: {
          run: {
            runId: string;
          };
          turns: Array<{
            turnId: string;
          }>;
          items: Array<{
            itemId: string;
          }>;
          events: Array<{
            eventType: string;
          }>;
        };
      }>(codexArtifactsResponse);
      const codexTurnsPayload = await responseJson<{
        data: {
          runId: string;
          turns: Array<{
            turnId: string;
            usage: {
              input_tokens: number;
              output_tokens: number;
            } | null;
          }>;
        };
      }>(codexTurnsResponse);
      const codexItemsPayload = await responseJson<{
        data: {
          runId: string;
          turnId: string | null;
          items: Array<{
            itemId: string;
            itemType: string;
          }>;
        };
      }>(codexItemsResponse);
      const codexItemsAllTurnsPayload = await responseJson<{
        data: {
          runId: string;
          turnId: string | null;
          items: Array<{
            itemId: string;
          }>;
        };
      }>(codexItemsAllTurnsResponse);
      const codexAgentMessagesPayload = await responseJson<{
        data: {
          runId: string;
          turnId: string | null;
          agentMessages: Array<{
            itemId: string;
            textPreview: string | null;
          }>;
        };
      }>(codexAgentMessagesResponse);
      const codexCommandExecutionsPayload = await responseJson<{
        data: {
          commandExecutions: unknown[];
        };
      }>(codexCommandExecutionsResponse);
      const codexOverflowPayload = await responseJson<{
        data: {
          runId: string;
          overflow: {
            overflowId: string;
            kind: string;
            contentText: string | null;
          };
        };
      }>(codexOverflowResponse);
      const missingCodexArtifactsPayload = await responseJson<{
        error: {
          code: string;
        };
      }>(missingCodexArtifactsResponse);
      const missingCodexOverflowPayload = await responseJson<{
        error: {
          code: string;
        };
      }>(missingCodexOverflowResponse);

      expect(codexArtifactsResponse.status).toBe(200);
      expect(codexArtifactsPayload.data.run.runId).toBe("run-123");
      expect(codexArtifactsPayload.data.turns[0]?.turnId).toBe("turn-123");
      expect(codexArtifactsPayload.data.items[0]?.itemId).toBe("item-123");
      expect(codexArtifactsPayload.data.events.length).toBeGreaterThanOrEqual(3);

      expect(codexOverflowResponse.status).toBe(200);
      expect(codexOverflowPayload.data.runId).toBe("run-123");
      expect(codexOverflowPayload.data.overflow.overflowId).toBe("item-123-overflow");
      expect(codexOverflowPayload.data.overflow.kind).toBe("agent_message");
      expect(codexOverflowPayload.data.overflow.contentText).toBe("Initial agent message");

      expect(codexTurnsResponse.status).toBe(200);
      expect(codexTurnsPayload.data.runId).toBe("run-123");
      expect(codexTurnsPayload.data.turns[0]?.turnId).toBe("turn-123");
      expect(codexTurnsPayload.data.turns[0]?.usage?.input_tokens).toBe(10);

      expect(codexItemsResponse.status).toBe(200);
      expect(codexItemsPayload.data.runId).toBe("run-123");
      expect(codexItemsPayload.data.turnId).toBe("turn-123");
      expect(codexItemsPayload.data.items[0]?.itemType).toBe("agent_message");

      expect(codexItemsAllTurnsResponse.status).toBe(200);
      expect(codexItemsAllTurnsPayload.data.runId).toBe("run-123");
      expect(codexItemsAllTurnsPayload.data.turnId).toBeNull();
      expect(codexItemsAllTurnsPayload.data.items[0]?.itemId).toBe("item-123");

      expect(codexAgentMessagesResponse.status).toBe(200);
      expect(codexAgentMessagesPayload.data.agentMessages[0]?.itemId).toBe(
        "item-123"
      );
      expect(codexAgentMessagesPayload.data.agentMessages[0]?.textPreview).toContain(
        "Initial agent message"
      );

      expect(codexCommandExecutionsResponse.status).toBe(200);
      expect(codexCommandExecutionsPayload.data.commandExecutions).toEqual([]);

      expect(missingCodexArtifactsResponse.status).toBe(404);
      expect(missingCodexArtifactsPayload.error.code).toBe("NOT_FOUND");
      expect(missingCodexOverflowResponse.status).toBe(404);
      expect(missingCodexOverflowPayload.error.code).toBe("NOT_FOUND");
    });

    it("serves the internal runtime-tools finish route", async () => {
      const response = await app.request("/api/v1/internal/runtime-tools/finish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          runId: "run-123",
          turnId: "turn-123",
          issue: {
            id: "issue-123",
            identifier: "COL-123",
            state: "In Progress"
          },
          arguments: {
            status: "partial",
            summary: "Partial delivery."
          }
        })
      });
      const payload = await responseJson<{
        data: {
          success: boolean;
          output: string;
        };
      }>(response);

      expect(response.status).toBe(200);
      expect(payload.data.success).toBe(true);
      expect(payload.data.output).toContain('"ok":true');
    });

    it("serves the internal runtime-tools spike-result route", async () => {
      const response = await app.request("/api/v1/internal/runtime-tools/spike-result", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          runId: "run-123",
          turnId: "turn-123",
          issue: {
            id: "issue-123",
            identifier: "COL-123",
            state: "In Progress"
          },
          arguments: {
            summary: "Documented the spike recommendation.",
            details: "- Findings\n- Recommendation",
            state: "Paused"
          }
        })
      });
      const payload = await responseJson<{
        data: {
          success: boolean;
          output: string;
        };
      }>(response);

      expect(response.status).toBe(200);
      expect(payload.data.success).toBe(true);
      expect(payload.data.output).toContain('"ok":true');
    });

    it("serves the internal runtime-tools cancel route", async () => {
      const response = await app.request("/api/v1/internal/runtime-tools/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          runId: "run-123",
          turnId: "turn-123",
          issue: {
            id: "issue-123",
            identifier: "COL-123",
            state: "In Progress"
          },
          arguments: {
            reason: "Cancel this issue because the requirements changed."
          }
        })
      });
      const payload = await responseJson<{
        data: {
          success: boolean;
          output: string;
        };
      }>(response);

      expect(response.status).toBe(200);
      expect(payload.data.success).toBe(true);
      expect(payload.data.output).toContain('"ok":true');
    });

    it("serves the internal runtime-tools merge-result route", async () => {
      const response = await app.request("/api/v1/internal/runtime-tools/merge-result", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          runId: "run-123",
          turnId: "turn-123",
          issue: {
            id: "issue-123",
            identifier: "COL-123",
            state: "In Progress"
          },
          arguments: {
            status: "merged",
            summary: "Merged the PR after syncing with main."
          }
        })
      });
      const payload = await responseJson<{
        data: {
          success: boolean;
          output: string;
        };
      }>(response);

      expect(response.status).toBe(200);
      expect(payload.data.success).toBe(true);
      expect(payload.data.output).toContain('"ok":true');
    });

    it("serves runtime issue details", async () => {
      const runtimeIssueResponse = await app.request("/api/v1/COL-123");
      const runtimeIssuePayload = await responseJson<{
        data: {
          issueIdentifier: string;
          workspace: {
            backendKind: string | null;
            workerHost: string | null;
            prepareDisposition: string | null;
            executionTargetKind: string | null;
            materializationKind: string | null;
            containerDisposition: string | null;
            hostPath: string | null;
            runtimePath: string | null;
            containerId: string | null;
            containerName: string | null;
            path: string | null;
            executionTarget:
              | {
                  kind: string;
                }
              | null;
          };
          tracked: {
            url: string | null;
          };
          operator: {
            githubPullRequestSearchUrl: string | null;
            requeueCommand: string;
            pi: {
              defaultModel: string | null;
              selectedModel: string | null;
            };
          };
        };
      }>(runtimeIssueResponse);

      expect(runtimeIssueResponse.status).toBe(200);
      expect(runtimeIssuePayload.data.issueIdentifier).toBe("COL-123");
      expect(runtimeIssuePayload.data.workspace.backendKind).toBe("docker");
      expect(runtimeIssuePayload.data.workspace.workerHost).toBeNull();
      expect(runtimeIssuePayload.data.workspace.hostPath).toContain("/symphony-COL-123");
      expect(runtimeIssuePayload.data.workspace.executionTarget?.kind).toBe("container");
      expect(runtimeIssuePayload.data.tracked.url).toBe(
        "https://linear.app/coldets/issue/col-123"
      );
      expect(runtimeIssuePayload.data.operator.githubPullRequestSearchUrl).toContain(
        "github.com/openai/symphony/pulls"
      );
      expect(runtimeIssuePayload.data.operator.requeueCommand).toBe("/rework");
      expect(runtimeIssuePayload.data.operator.pi.defaultModel).toBe(
        "xiaomi/mimo-v2-pro"
      );
      expect(runtimeIssuePayload.data.operator.pi.selectedModel).toBe(
        "xiaomi/mimo-v2-pro"
      );
    });
  });

  it("serves tracker-only runtime issue context when no live runtime state exists", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "Done"
      },
      snapshot: {
        running: [],
        retrying: []
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const runtimeIssueResponse = await app.request("/api/v1/COL-123");
    const runtimeIssuePayload = await responseJson<{
      data: {
        issueIdentifier: string;
        status: string;
        workspace: {
          backendKind: string | null;
          workerHost: string | null;
          prepareDisposition: string | null;
          executionTargetKind: string | null;
          materializationKind: string | null;
          containerDisposition: string | null;
          hostPath: string | null;
          runtimePath: string | null;
          containerId: string | null;
          containerName: string | null;
          path: string | null;
          executionTarget: null;
          materialization: null;
        };
        tracked: {
          url: string | null;
        };
        running: null;
        retry: null;
      };
    }>(runtimeIssueResponse);

    expect(runtimeIssueResponse.status).toBe(200);
    expect(runtimeIssuePayload.data.issueIdentifier).toBe("COL-123");
    expect(runtimeIssuePayload.data.status).toBe("tracked");
    expect(runtimeIssuePayload.data.workspace.backendKind).toBeNull();
    expect(runtimeIssuePayload.data.workspace.workerHost).toBeNull();
    expect(runtimeIssuePayload.data.workspace.path).toBeNull();
    expect(runtimeIssuePayload.data.workspace.executionTarget).toBeNull();
    expect(runtimeIssuePayload.data.workspace.materialization).toBeNull();
    expect(runtimeIssuePayload.data.tracked.url).toBe(
      "https://linear.app/coldets/issue/col-123"
    );
    expect(runtimeIssuePayload.data.running).toBeNull();
    expect(runtimeIssuePayload.data.retry).toBeNull();
  });

  it("serves the new health, runtime logs, and issue timeline surfaces", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const healthResponse = await app.request("/api/v1/health");
    const logsResponse = await app.request("/api/v1/runtime/logs");
    const timelineResponse = await app.request("/api/v1/issues/COL-123/timeline");

    const healthPayload = await responseJson<{
      data: {
        healthy: boolean;
        db: {
          ready: boolean;
        };
      };
    }>(healthResponse);
    const logsPayload = await responseJson<{
      data: {
        logs: Array<{
          eventType: string;
        }>;
      };
    }>(logsResponse);
    const timelinePayload = await responseJson<{
      data: {
        entries: Array<{
          eventType: string;
        }>;
      };
    }>(timelineResponse);

    expect(healthResponse.status).toBe(200);
    expect(healthPayload.data.healthy).toBe(true);
    expect(healthPayload.data.db.ready).toBe(true);

    expect(logsResponse.status).toBe(200);
    expect(logsPayload.data.logs.some((log) => log.eventType === "runtime_session_started")).toBe(
      true
    );
    expect(logsPayload.data.logs.some((log) => log.eventType === "db_initialized")).toBe(true);

    expect(timelineResponse.status).toBe(200);
    expect(timelinePayload.data.entries[0]?.eventType).toBe("retry_scheduled");
  });

  it("fails closed on invalid params and ingests GitHub review events", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const rawBody = JSON.stringify(buildSymphonyGitHubPullRequestReviewPayload());
    const signature = signSymphonyGitHubWebhook(rawBody, "secret");

    const invalidResponse = await app.request("/api/v1/issues?limit=0");
    const ingressResponse = await app.request("/api/v1/github/review-events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-1",
        "x-github-event": "pull_request_review",
        "x-hub-signature-256": signature
      },
      body: rawBody
    });
    const invalidPayload = await responseJson<{
      error: {
        code: string;
      };
    }>(invalidResponse);
    const ingressPayload = await responseJson<{
      data: {
        accepted: boolean;
      };
    }>(ingressResponse);

    expect(invalidResponse.status).toBe(400);
    expect(invalidPayload.error.code).toBe("VALIDATION_FAILED");

    expect(ingressResponse.status).toBe(202);
    expect(ingressPayload.data.accepted).toBe(true);
  });

  it("fails closed on invalid agent analytics query params", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const invalidItemsResponse = await app.request(
      "/api/v1/agent/runs/run-123/items?turnId=%20"
    );
    const invalidItemsPayload = await responseJson<{
      error: {
        code: string;
      };
    }>(invalidItemsResponse);

    expect(invalidItemsResponse.status).toBe(400);
    expect(invalidItemsPayload.error.code).toBe("VALIDATION_FAILED");
  });

  it("accepts raw GitHub issue_comment /rework webhooks", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const rawBody = JSON.stringify(buildSymphonyGitHubIssueCommentPayload());
    const signature = signSymphonyGitHubWebhook(rawBody, "secret");

    const ingressResponse = await app.request("/api/v1/github/review-events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-issue-comment-1",
        "x-github-event": "issue_comment",
        "x-hub-signature-256": signature
      },
      body: rawBody
    });
    const ingressPayload = await responseJson<{
      data: {
        accepted: boolean;
        event: string;
      };
    }>(ingressResponse);

    expect(ingressResponse.status).toBe(202);
    expect(ingressPayload.data.accepted).toBe(true);
    expect(ingressPayload.data.event).toBe("issue_comment");
  });

  it(
    "persists a structured rework handoff after GitHub review ingress",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness();
      harnesses.push(harness);

      const tracker = harness.services.tracker as MemorySymphonyTracker;
      tracker.setIssues([
        buildSymphonyTrackerIssue({
          identifier: "COL-123",
          state: "In Review",
          branchName: "symphony/COL-123"
        })
      ]);
      harness.services.orchestrator.requestRefresh = async () => ({
        queued: true,
        coalesced: false,
        requestedAt: "2026-03-31T00:00:00.000Z",
        operations: ["poll", "reconcile"]
      });

      const app = createSymphonyRuntimeApp(harness.services);
      const rawBody = JSON.stringify(buildSymphonyGitHubPullRequestReviewPayload());
      const signature = signSymphonyGitHubWebhook(rawBody, "secret");

      const ingressResponse = await app.request("/api/v1/github/review-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": "delivery-review-structured-handoff",
          "x-github-event": "pull_request_review",
          "x-hub-signature-256": signature
        },
        body: rawBody
      });
      const trackedIssue = await harness.services.tracker.fetchIssueByIdentifier(
        harness.runtimePolicy.tracker,
        "COL-123"
      );
      const issueTimeline = await harness.services.issueTimeline.list({
        issueIdentifier: "COL-123"
      });

      expect(ingressResponse.status).toBe(202);
      expect(trackedIssue?.state).toBe("Rework");
      expect(issueTimeline).not.toBeNull();

      const reworkHandoffEntry = issueTimeline?.entries.find(
        (entry) => entry.eventType === runtimeReworkHandoffEventType
      );
      expect(reworkHandoffEntry).toMatchObject({
        eventType: runtimeReworkHandoffEventType,
        message: "Stored rework handoff for the next run.",
        payload: {
          source: "github_review",
          triggerKind: "changes_requested_review",
          actorLogin: "reviewer",
          pullRequestUrl: "https://github.com/openai/symphony/pull/123",
          reviewContextUrl:
            "https://github.com/openai/symphony/pull/123#pullrequestreview-999",
          feedbackBody: null
        }
      });
    },
    runtimeHttpIntegrationTestTimeoutMs
  );

  it("accepts raw GitHub pull_request_review_comment webhooks", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const rawBody = JSON.stringify(
      buildSymphonyGitHubPullRequestReviewCommentPayload()
    );
    const signature = signSymphonyGitHubWebhook(rawBody, "secret");

    const ingressResponse = await app.request("/api/v1/github/review-events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-pr-review-comment-1",
        "x-github-event": "pull_request_review_comment",
        "x-hub-signature-256": signature
      },
      body: rawBody
    });
    const ingressPayload = await responseJson<{
      data: {
        accepted: boolean;
        event: string;
      };
    }>(ingressResponse);

    expect(ingressResponse.status).toBe(202);
    expect(ingressPayload.data.accepted).toBe(true);
    expect(ingressPayload.data.event).toBe("pull_request_review_comment");
  });

  it("allows local dashboard origins to read the runtime api", async () => {
    const harness = await createSymphonyRuntimeTestHarness();
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const response = await app.request("/api/v1/problem-runs", {
      headers: {
        origin: "http://localhost:3000"
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000"
    );
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("rejects disallowed cors preflight requests", async () => {
    const harness = await createSymphonyRuntimeTestHarness();
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services, {
      allowedOrigins: ["http://localhost:3000"]
    });
    const response = await app.request("/api/v1/problem-runs", {
      method: "OPTIONS",
      headers: {
        origin: "https://example.com"
      }
    });

    expect(response.status).toBe(403);
  });
});
