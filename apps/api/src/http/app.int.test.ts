import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import {
  createSymphonyIssueStore,
  createSqliteSymphonyRuntimeRunStore,
  initializeSymphonyDb
} from "@symphony/db";
import type {
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowPolicy
} from "@symphony/router";
import type { MemorySymphonyTracker } from "@symphony/tracker";
import { createSymphonyRuntimeApp } from "./app.js";
import type { SymphonyRuntimeTestHarness } from "../test-support/create-symphony-runtime-test-harness.js";
import {
  createSymphonyRuntimeAppServicesHarness,
  type SymphonyRuntimeAppServicesHarness
} from "../test-support/create-symphony-runtime-app-services-harness.js";
import { createSymphonyRuntimeTestHarness } from "../test-support/create-symphony-runtime-test-harness.js";
import {
  buildBootstrapInstallLifecycleEvent,
  createRuntimeDbObserverTestSupport
} from "../test-support/runtime-lifecycle-test-support.js";

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
      const configResponse = await app.request("/api/v1/runtime/config");
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
      const configPayload = await responseJson<{
        data: {
          runtime: {
            repositoryKey: string;
            githubRepository: string;
          };
          bootstrap: {
            presetSelection: {
              presetId: string;
            };
          };
          admittedRepositories: Array<{
            repositoryKey: string;
          }>;
        };
      }>(configResponse);
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

      expect(configResponse.status).toBe(200);
      expect(configPayload.data.runtime.repositoryKey).toBe("openai/symphony");
      expect(configPayload.data.runtime.githubRepository).toBe("openai/symphony");
      expect(configPayload.data.bootstrap.presetSelection.presetId).toBe(
        "intelligent-flow"
      );
      expect(configPayload.data.admittedRepositories.map((entry) => entry.repositoryKey)).toEqual([
        "openai/symphony"
      ]);

      expect(refreshResponse.status).toBe(202);
      expect(refreshPayload.data.queued).toBe(true);
    },
    runtimeHttpIntegrationTestTimeoutMs
  );

  it("serves the runtime state and refresh surfaces", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Progress",
        teamKey: "COL",
        projectId: "project-1"
      },
      workflowTrackerState: "Bootstrapping"
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
          state: string;
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
    expect(statePayload.data.running[0]?.state).toBe("Bootstrapping");

    expect(refreshResponse.status).toBe(202);
    expect(refreshPayload.data.queued).toBe(true);
    expect(refreshPayload.data.coalesced).toBe(false);
    expect(refreshPayload.data.operations).toEqual(["poll", "reconcile"]);
  });

  it(
    "observes explicit non-running tracker state changes through workflow history",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness();
      harnesses.push(harness);

      const tracker = harness.services.tracker as MemorySymphonyTracker;
      tracker.setIssues([
        buildSymphonyTrackerIssue({
          identifier: "COL-777",
          state: "Todo",
          branchName: "symphony/COL-777"
        })
      ]);
      const routedDispatches: Array<{
        workflowId: string;
        commandId: string;
        issueIdentifier: string;
        runMode: string;
      }> = [];
      harness.services.orchestrator.dispatchRoutedIssue = async (input) => {
        routedDispatches.push({
          workflowId: input.workflowId,
          commandId: input.commandId,
          issueIdentifier: input.trackerIssue.identifier,
          runMode: input.runMode
        });
      };

      const app = createSymphonyRuntimeApp(harness.services);
      const firstResponse = await app.request(
        "/api/v1/internal/tracker-state/non-running/observe",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            issueIdentifier: "COL-777"
          })
        }
      );
      const firstPayload = await responseJson<{
        data: {
          issueIdentifier: string;
          observedTrackerState: string;
          workflowTrackerState: string | null;
          observed: boolean;
          disposition: "observed" | "skipped" | "ignored";
          recordedAt: string;
        };
      }>(firstResponse);

      const hydration =
        await harness.services.routeWorkflows.loadHydrationStateByIssueIdentifier<
          SymphonyIntelligentFlowNode,
          SymphonyIntelligentFlowData,
          SymphonyIntelligentFlowPolicy
        >("COL-777");

      const secondResponse = await app.request(
        "/api/v1/internal/tracker-state/non-running/observe",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            issueIdentifier: "COL-777"
          })
        }
      );
      const secondPayload = await responseJson<{
        data: {
          issueIdentifier: string;
          observedTrackerState: string;
          workflowTrackerState: string | null;
          observed: boolean;
          disposition: "observed" | "skipped" | "ignored";
          recordedAt: string;
        };
      }>(secondResponse);

      expect(firstResponse.status).toBe(200);
      expect(firstPayload.data.issueIdentifier).toBe("COL-777");
      expect(firstPayload.data.observedTrackerState).toBe("Todo");
      expect(firstPayload.data.workflowTrackerState).toBe("Bootstrapping");
      expect(firstPayload.data.observed).toBe(true);
      expect(firstPayload.data.disposition).toBe("observed");
      expect(firstPayload.data.recordedAt).toBeTruthy();
      expect(routedDispatches).toHaveLength(2);
      expect(routedDispatches).toEqual([
        {
          workflowId: expect.any(String),
          commandId: expect.any(String),
          issueIdentifier: "COL-777",
          runMode: "implementation"
        },
        {
          workflowId: expect.any(String),
          commandId: expect.any(String),
          issueIdentifier: "COL-777",
          runMode: "implementation"
        }
      ]);
      expect(hydration?.snapshot?.projection.currentNode).toBe("claimed");
      expect(hydration?.snapshot?.projection.data.trackerState).toBe("Bootstrapping");

      expect(secondResponse.status).toBe(200);
      expect(secondPayload.data).toEqual({
        issueIdentifier: "COL-777",
        observedTrackerState: "Bootstrapping",
        workflowTrackerState: "Bootstrapping",
        observed: true,
        disposition: "observed",
        recordedAt: expect.any(String)
      });
      expect(routedDispatches).toHaveLength(2);
    },
    runtimeHttpIntegrationTestTimeoutMs
  );

  it(
    "returns 404 when explicit tracker state observation targets a missing issue",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness();
      harnesses.push(harness);

      const app = createSymphonyRuntimeApp(harness.services);
      const response = await app.request(
        "/api/v1/internal/tracker-state/non-running/observe",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            issueIdentifier: "COL-404"
          })
        }
      );
      const payload = await responseJson<{
        error: {
          code: string;
        };
      }>(response);

      expect(response.status).toBe(404);
      expect(payload.error.code).toBe("NOT_FOUND");
    },
    runtimeHttpIntegrationTestTimeoutMs
  );

  it("serves mirrored bootstrap lifecycle runtime logs in the forensics bundle", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const repositoryKey = harness.runtimePolicy.github.repo;
    if (!repositoryKey) {
      throw new TypeError("Runtime test harness requires runtimePolicy.github.repo.");
    }

    const { observer } = createRuntimeDbObserverTestSupport({
      dbFile: `${harness.root}/symphony.db`,
      repositoryKey
    });

    await observer.recordLifecycleEvent(
      buildBootstrapInstallLifecycleEvent({
        issue: harness.issue,
        recordedAt: "2026-04-09T22:15:00.000Z"
      })
    );

    const app = createSymphonyRuntimeApp(harness.services);
    const response = await app.request(
      `/api/v1/issues/${harness.issue.identifier}/forensics-bundle?repo=${encodeURIComponent(repositoryKey)}`
    );
    const payload = await responseJson<{
      data: {
        timeline: Array<{
          eventType: string;
        }>;
        runtimeLogs: Array<{
          issueIdentifier: string;
          runId: string | null;
          source: string;
          eventType: string;
          message: string;
        }>;
      };
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "workspace_manifest_step_started"
        })
      ])
    );
    expect(payload.data.runtimeLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueIdentifier: harness.issue.identifier,
          runId: null,
          source: "workspace",
          eventType: "workspace_manifest_step_started",
          message: "Manifest lifecycle step bootstrap/install started."
        })
      ])
    );
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
      const agentArtifactsResponse = await app.request(
        "/api/v1/agent/runs/run-123/artifacts"
      );
      const agentOverflowResponse = await app.request(
        "/api/v1/agent/runs/run-123/overflow/item-123-overflow"
      );
      const agentTurnsResponse = await app.request("/api/v1/agent/runs/run-123/turns");
      const agentItemsResponse = await app.request(
        "/api/v1/agent/runs/run-123/items?turnId=turn-123"
      );
      const agentItemsAllTurnsResponse = await app.request(
        "/api/v1/agent/runs/run-123/items"
      );
      const agentMessagesResponse = await app.request(
        "/api/v1/agent/runs/run-123/agent-messages?turnId=turn-123"
      );
      const agentCommandExecutionsResponse = await app.request(
        "/api/v1/agent/runs/run-123/command-executions"
      );
      const missingAgentArtifactsResponse = await app.request(
        "/api/v1/agent/runs/run-missing/artifacts"
      );
      const missingAgentOverflowResponse = await app.request(
        "/api/v1/agent/runs/run-123/overflow/overflow-missing"
      );
      const agentArtifactsPayload = await responseJson<{
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
      }>(agentArtifactsResponse);
      const agentTurnsPayload = await responseJson<{
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
      }>(agentTurnsResponse);
      const agentItemsPayload = await responseJson<{
        data: {
          runId: string;
          turnId: string | null;
          items: Array<{
            itemId: string;
            itemType: string;
          }>;
        };
      }>(agentItemsResponse);
      const agentItemsAllTurnsPayload = await responseJson<{
        data: {
          runId: string;
          turnId: string | null;
          items: Array<{
            itemId: string;
          }>;
        };
      }>(agentItemsAllTurnsResponse);
      const agentMessagesPayload = await responseJson<{
        data: {
          runId: string;
          turnId: string | null;
          agentMessages: Array<{
            itemId: string;
            textPreview: string | null;
          }>;
        };
      }>(agentMessagesResponse);
      const agentCommandExecutionsPayload = await responseJson<{
        data: {
          commandExecutions: unknown[];
        };
      }>(agentCommandExecutionsResponse);
      const agentOverflowPayload = await responseJson<{
        data: {
          runId: string;
          overflow: {
            overflowId: string;
            kind: string;
            contentText: string | null;
          };
        };
      }>(agentOverflowResponse);
      const missingAgentArtifactsPayload = await responseJson<{
        error: {
          code: string;
        };
      }>(missingAgentArtifactsResponse);
      const missingAgentOverflowPayload = await responseJson<{
        error: {
          code: string;
        };
      }>(missingAgentOverflowResponse);

      expect(agentArtifactsResponse.status).toBe(200);
      expect(agentArtifactsPayload.data.run.runId).toBe("run-123");
      expect(agentArtifactsPayload.data.turns[0]?.turnId).toBe("turn-123");
      expect(agentArtifactsPayload.data.items[0]?.itemId).toBe("item-123");
      expect(agentArtifactsPayload.data.events.length).toBeGreaterThanOrEqual(3);

      expect(agentOverflowResponse.status).toBe(200);
      expect(agentOverflowPayload.data.runId).toBe("run-123");
      expect(agentOverflowPayload.data.overflow.overflowId).toBe("item-123-overflow");
      expect(agentOverflowPayload.data.overflow.kind).toBe("agent_message");
      expect(agentOverflowPayload.data.overflow.contentText).toBe("Initial agent message");

      expect(agentTurnsResponse.status).toBe(200);
      expect(agentTurnsPayload.data.runId).toBe("run-123");
      expect(agentTurnsPayload.data.turns[0]?.turnId).toBe("turn-123");
      expect(agentTurnsPayload.data.turns[0]?.usage?.input_tokens).toBe(11);

      expect(agentItemsResponse.status).toBe(200);
      expect(agentItemsPayload.data.runId).toBe("run-123");
      expect(agentItemsPayload.data.turnId).toBe("turn-123");
      expect(agentItemsPayload.data.items[0]?.itemType).toBe("agent_message");

      expect(agentItemsAllTurnsResponse.status).toBe(200);
      expect(agentItemsAllTurnsPayload.data.runId).toBe("run-123");
      expect(agentItemsAllTurnsPayload.data.turnId).toBeNull();
      expect(agentItemsAllTurnsPayload.data.items[0]?.itemId).toBe("item-123");

      expect(agentMessagesResponse.status).toBe(200);
      expect(agentMessagesPayload.data.agentMessages[0]?.itemId).toBe(
        "item-123"
      );
      expect(agentMessagesPayload.data.agentMessages[0]?.textPreview).toContain(
        "Initial agent message"
      );

      expect(agentCommandExecutionsResponse.status).toBe(200);
      expect(agentCommandExecutionsPayload.data.commandExecutions).toEqual([]);

      expect(missingAgentArtifactsResponse.status).toBe(404);
      expect(missingAgentArtifactsPayload.error.code).toBe("NOT_FOUND");
      expect(missingAgentOverflowResponse.status).toBe(404);
      expect(missingAgentOverflowPayload.error.code).toBe("NOT_FOUND");
    });

    it("uses canonical runtime runs as agent route parents when shadow rows are absent", async () => {
      const servicesHarness = await createSymphonyRuntimeAppServicesHarness();
      harnesses.push(servicesHarness);

      const database = initializeSymphonyDb({
        dbFile: servicesHarness.env.dbFile
      });

      try {
        const issueStore = createSymphonyIssueStore(database.db);
        const runStore = createSqliteSymphonyRuntimeRunStore({
          db: database.db
        });
        await issueStore.upsert({
          issueIdentifier: "COL-901",
          trackerIssueId: "issue-runtime-only",
          repositoryKey: "openai/symphony",
          latestRunStartedAt: null,
          recordedAt: "2026-04-09T12:00:00.000Z"
        });
        await runStore.recordRunStarted({
          runId: "run-runtime-only",
          repositoryKey: "openai/symphony",
          trackerIssueId: "issue-runtime-only",
          issueIdentifier: "COL-901",
          runMode: "implementation",
          startedAt: "2026-04-09T12:00:00.000Z",
          status: "running"
        });
        await runStore.recordTurnStarted("run-runtime-only", {
          turnId: "turn-runtime-only",
          turnSequence: 1,
          promptText: "Inspect runtime-only agent routes.",
          status: "running",
          startedAt: "2026-04-09T12:00:01.000Z",
          threadId: "thread-runtime-only"
        });
        await runStore.upsertRunContext("run-runtime-only", {
          harnessKind: "pi",
          threadId: "thread-runtime-only"
        });
      } finally {
        database.close();
      }

      const runtimeOnlyApp = createSymphonyRuntimeApp(servicesHarness.services);
      const artifactsResponse = await runtimeOnlyApp.request(
        "/api/v1/agent/runs/run-runtime-only/artifacts"
      );
      const turnsResponse = await runtimeOnlyApp.request(
        "/api/v1/agent/runs/run-runtime-only/turns"
      );
      const missingTurnsResponse = await runtimeOnlyApp.request(
        "/api/v1/agent/runs/run-missing/turns"
      );
      const artifactsPayload = await responseJson<{
        data: {
          run: {
            runId: string;
            threadId: string | null;
          };
          turns: Array<{
            turnId: string;
          }>;
          items: unknown[];
          events: unknown[];
        };
      }>(artifactsResponse);
      const turnsPayload = await responseJson<{
        data: {
          runId: string;
          turns: Array<{
            turnId: string;
            threadId: string | null;
          }>;
        };
      }>(turnsResponse);
      const missingTurnsPayload = await responseJson<{
        error: {
          code: string;
        };
      }>(missingTurnsResponse);

      expect(artifactsResponse.status).toBe(200);
      expect(artifactsPayload.data.run.runId).toBe("run-runtime-only");
      expect(artifactsPayload.data.run.threadId).toBe("thread-runtime-only");
      expect(artifactsPayload.data.turns).toEqual([
        expect.objectContaining({
          turnId: "turn-runtime-only"
        })
      ]);
      expect(artifactsPayload.data.items).toEqual([]);
      expect(artifactsPayload.data.events).toEqual([]);

      expect(turnsResponse.status).toBe(200);
      expect(turnsPayload.data.runId).toBe("run-runtime-only");
      expect(turnsPayload.data.turns).toEqual([
        expect.objectContaining({
          turnId: "turn-runtime-only",
          threadId: "thread-runtime-only"
        })
      ]);

      expect(missingTurnsResponse.status).toBe(404);
      expect(missingTurnsPayload.error.code).toBe("NOT_FOUND");
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

  it("returns an empty timeline for an existing issue with no timeline entries", async () => {
    const harness = await createSymphonyRuntimeAppServicesHarness();
    harnesses.push(harness);

    const database = initializeSymphonyDb({
      dbFile: harness.env.dbFile
    });

    try {
      const issueStore = createSymphonyIssueStore(database.db);
      await issueStore.upsert({
        issueIdentifier: "COL-EMPTY",
        trackerIssueId: "issue-empty",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-11T05:00:00.000Z"
      });
    } finally {
      database.close();
    }

    const app = createSymphonyRuntimeApp(harness.services);
    const response = await app.request("/api/v1/issues/COL-EMPTY/timeline");
    const payload = await responseJson<{
      data: {
        repositoryKey: string;
        issueIdentifier: string;
        entries: unknown[];
      };
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.data.repositoryKey).toBe("openai/symphony");
    expect(payload.data.issueIdentifier).toBe("COL-EMPTY");
    expect(payload.data.entries).toEqual([]);
  });

  it("fails closed on invalid params", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const invalidResponse = await app.request("/api/v1/issues?limit=0");
    const invalidPayload = await responseJson<{
      error: {
        code: string;
      };
    }>(invalidResponse);

    expect(invalidResponse.status).toBe(400);
    expect(invalidPayload.error.code).toBe("VALIDATION_FAILED");
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
