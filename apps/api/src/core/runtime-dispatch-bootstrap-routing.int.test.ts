import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb
} from "@symphony/db";
import {
  createDeterministicStrategy,
  createSymphonyCurrentFlowTrackerTransitionCommand,
  createWorkflowRouterAsync,
  WorkflowEdge,
  WorkflowNode,
  type WorkflowRouterPreset
} from "@symphony/router";
import type {
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowPolicy
} from "@symphony/router";
import { buildSymphonyRuntimePolicy, buildSymphonyTrackerIssue } from "@symphony/test-support";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { expectRouteWorkflowAuthorityProof } from "../test-support/route-workflow-authority-test-support.js";
import {
  createRuntimeCurrentFlowRouting,
  type SymphonyRuntimeRouterPresetSelection
} from "./runtime-workflow-presets.js";
import {
  createRuntimeWorkflowSessionLoader,
  type SymphonyLoadedRuntimeWorkflowHydration,
  type SymphonyLoadedRuntimeWorkflowSession,
  type SymphonyRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import { createRuntimeDispatchBootstrapRouter } from "./runtime-dispatch-bootstrap-routing.js";
import {
  createRouteWorkflowPort,
  resumeRouteWorkflowSession
} from "./runtime-route-workflows.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("runtime dispatch bootstrap routing", () => {
  it("binds first dispatch workflow to the issue-resolved repository in multi-repo setups", async () => {
    const harness = await createHarness({
      state: "Todo",
      repositoryKey: "conacts/coldets-v2",
      issue: buildSymphonyTrackerIssue({
        id: "issue-bootstrap-sym",
        identifier: "SYM-BOOTSTRAP",
        state: "Todo",
        teamKey: "SYM"
      }),
      seedIssueIdentity: false,
      resolveIssueRepositoryKey() {
        return "conacts/symphony";
      }
    });

    try {
      expect(
        await harness.issueStore.fetchByTrackerIssueKey(harness.issue.identifier)
      ).toBeNull();

      const result = await harness.router.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T09:59:59.000Z"
      });

      expect(result.issue.state).toBe("Bootstrapping");
      expect(result.runMode).toBe("implementation");
      expect(await harness.issueStore.fetchByTrackerIssueKey(harness.issue.identifier)).toEqual(
        expect.objectContaining({
          trackerIssueKey: harness.issue.identifier,
          trackerIssueId: harness.issue.id,
          repositoryKey: "conacts/symphony"
        })
      );

      const hydration =
        await harness.routeWorkflows.loadHydrationStateByTrackerIssueKey<
          SymphonyCurrentFlowNode,
          SymphonyCurrentFlowData,
          SymphonyCurrentFlowPolicy
        >(harness.issue.identifier);
      expect(hydration?.workflow.repositoryKey).toBe("conacts/symphony");
    } finally {
      harness.close();
    }
  });

  it("routes Todo work into Bootstrapping and selects implementation mode", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const result = await harness.router.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T10:00:00.000Z"
      });

      expect(result.issue.state).toBe("Bootstrapping");
      expect(result.runMode).toBe("implementation");
      expect(harness.tracker.listOperations()).toEqual(
        expect.arrayContaining([
          {
            kind: "update_state",
            issueId: harness.issue.id,
            stateName: "Bootstrapping"
          },
          {
            kind: "comment",
            issueId: harness.issue.id,
            body: expect.stringContaining("moved it from `Todo` to `Bootstrapping`")
          }
        ])
      );

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "todo_claimed_for_dispatch",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("re-dispatches Bootstrapping work after restart using persisted route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.router.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T10:05:00.000Z"
      });

      const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
      expect(bootstrappingIssue?.state).toBe("Bootstrapping");

      const result = await harness.router.route({
        issue: bootstrappingIssue!,
        attempt: 2,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T10:06:00.000Z"
      });

      expect(result.issue.state).toBe("Bootstrapping");
      expect(result.runMode).toBe("implementation");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "bootstrapping_redispatched",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("routes Approved work directly into approved_merge mode without a tracker transition", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      const result = await harness.router.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T10:10:00.000Z"
      });

      expect(result.issue.state).toBe("Approved");
      expect(result.runMode).toBe("approved_merge");
      expect(harness.tracker.listOperations()).toEqual([]);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "approved_merge",
        reasonCode: "approved_merge_requested",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.lastDispatchMode).toBe("approved_merge");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("fails fast when bootstrap routing does not emit a dispatch command", async () => {
    const harness = await createHarness({
      state: "Todo",
      routing: await createNoDispatchBootstrapRouting()
    });

    try {
      await expect(
        harness.router.route({
          issue: harness.issue,
          attempt: 1,
          preferredWorkerHost: null,
          startedAt: "2026-04-10T10:15:00.000Z"
        })
      ).rejects.toThrow("did not produce a dispatch run mode");
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  state: "Todo" | "Approved";
  issue?: ReturnType<typeof buildSymphonyTrackerIssue>;
  repositoryKey?: string;
  routing?: SymphonyRuntimeRouterPresetSelection;
  seedIssueIdentity?: boolean;
  resolveIssueRepositoryKey?(issue: ReturnType<typeof buildSymphonyTrackerIssue>): string;
}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-dispatch-bootstrap-router-"));
  tempDirectories.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueStore = createSymphonyIssueStore(database.db);
  const routeWorkflowStore = createRouteWorkflowStore(database.db);
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore
  });
  const runtimePolicy = buildSymphonyRuntimePolicy();
  const issue =
    input.issue ??
    buildSymphonyTrackerIssue({
      state: input.state
    });
  const tracker = createMemorySymphonyTracker([issue]);
  const repositoryKey = input.repositoryKey ?? "openai/symphony";

  if (input.seedIssueIdentity ?? true) {
    await issueStore.upsert({
      trackerIssueKey: issue.identifier,
      trackerIssueId: issue.id,
      repositoryKey,
      latestRunStartedAt: null,
      recordedAt: "2026-04-10T00:00:59.000Z"
    });
  }

  const routing =
    input.routing ??
    (await createRuntimeCurrentFlowRouting({
      trackerConfig: runtimePolicy.tracker,
      now: () => new Date("2026-04-10T10:00:00.000Z")
    }));
  const sessionLoader =
    input.routing
      ? createStaticSessionLoader({
          routeWorkflows,
          routing: input.routing
        })
      : await createRuntimeWorkflowSessionLoader({
          routeWorkflows,
          trackerConfig: runtimePolicy.tracker,
          now: () => new Date("2026-04-10T10:00:00.000Z")
        });
  const router = await createRuntimeDispatchBootstrapRouter({
    routeWorkflows,
    tracker,
    trackerConfig: runtimePolicy.tracker,
    repositoryKey,
    resolveIssueRepositoryKey: input.resolveIssueRepositoryKey,
    async ensureIssueIdentity(observedIssue) {
      const resolvedRepositoryKey =
        input.resolveIssueRepositoryKey?.(observedIssue) ?? repositoryKey;
      await issueStore.upsert({
        trackerIssueKey: observedIssue.identifier,
        trackerIssueId: observedIssue.id,
        repositoryKey: resolvedRepositoryKey,
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:00:59.000Z"
      });
    },
    routing,
    sessionLoader
  });

  return {
    issue,
    issueStore,
    tracker,
    routeWorkflows,
    router,
    close() {
      database.close();
    }
  };
}

function createStaticSessionLoader(input: {
  routeWorkflows: ReturnType<typeof createRouteWorkflowPort>;
  routing: SymphonyRuntimeRouterPresetSelection;
}): SymphonyRuntimeWorkflowSessionLoader {
  const loadHydrationByWorkflowId = async (workflowId: string) => {
    const hydrationState =
      await input.routeWorkflows.loadHydrationStateByWorkflowId(workflowId);
    if (!hydrationState) {
      return null;
    }

    return {
      routing: input.routing,
      hydrationState
    } satisfies SymphonyLoadedRuntimeWorkflowHydration;
  };

  const loadHydrationByTrackerIssueKey = async (trackerIssueKey: string) => {
    const hydrationState =
      await input.routeWorkflows.loadHydrationStateByTrackerIssueKey(
        trackerIssueKey
      );
    if (!hydrationState) {
      return null;
    }

    return {
      routing: input.routing,
      hydrationState
    } satisfies SymphonyLoadedRuntimeWorkflowHydration;
  };
  const loadHydrationByScopedTrackerIssueKey = async (inputByScope: {
    trackerIssueKey: string;
    bindingScope: {
      organizationId: string;
      linearWorkspaceIdentityId: string;
    };
  }) => {
    const hydrationState =
      await input.routeWorkflows.loadHydrationStateByScopedTrackerIssueKey(inputByScope);
    if (!hydrationState) {
      return null;
    }

    return {
      routing: input.routing,
      hydrationState
    } satisfies SymphonyLoadedRuntimeWorkflowHydration;
  };

  return {
    async loadHydrationByWorkflowId({ workflowId }) {
      return await loadHydrationByWorkflowId(workflowId);
    },
    async loadHydrationByTrackerIssueKey({ trackerIssueKey }) {
      return await loadHydrationByTrackerIssueKey(trackerIssueKey);
    },
    async loadHydrationByScopedTrackerIssueKey(scopedInput) {
      return await loadHydrationByScopedTrackerIssueKey(scopedInput);
    },
    async resumeByWorkflowId({ workflowId }) {
      const loaded = await loadHydrationByWorkflowId(workflowId);
      if (!loaded) {
        return null;
      }

      return {
        routing: input.routing,
        resumed: await resumeRouteWorkflowSession({
          hydrationState: loaded.hydrationState,
          router: input.routing.router as never,
          policy: input.routing.policy as never
        })
      } satisfies SymphonyLoadedRuntimeWorkflowSession;
    },
    async resumeByTrackerIssueKey({ trackerIssueKey }) {
      const loaded = await loadHydrationByTrackerIssueKey(trackerIssueKey);
      if (!loaded) {
        return null;
      }

      return {
        routing: input.routing,
        resumed: await resumeRouteWorkflowSession({
          hydrationState: loaded.hydrationState,
          router: input.routing.router as never,
          policy: input.routing.policy as never
        })
      } satisfies SymphonyLoadedRuntimeWorkflowSession;
    },
    async resumeByScopedTrackerIssueKey(scopedInput) {
      const loaded = await loadHydrationByScopedTrackerIssueKey(scopedInput);
      if (!loaded) {
        return null;
      }

      return {
        routing: input.routing,
        resumed: await resumeRouteWorkflowSession({
          hydrationState: loaded.hydrationState,
          router: input.routing.router as never,
          policy: input.routing.policy as never
        })
      } satisfies SymphonyLoadedRuntimeWorkflowSession;
    }
  };
}

async function createNoDispatchBootstrapRouting(): Promise<SymphonyRuntimeRouterPresetSelection> {
  const baselineRouting = await createRuntimeCurrentFlowRouting({
    trackerConfig: buildSymphonyRuntimePolicy().tracker,
    now: () => new Date("2026-04-10T10:00:00.000Z")
  });
  const preset = {
    async createRouter() {
      return await createWorkflowRouterAsync<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        name: "symphony-current-flow-no-dispatch",
        version: "1",
        initialNode: "idle",
        nodes: [
          new WorkflowNode("idle"),
          new WorkflowNode("bootstrapping")
        ],
        edges: [
          new WorkflowEdge({
            id: "idle_todo_to_bootstrapping_without_dispatch",
            from: "idle",
            to: "bootstrapping",
            reasonCode: "todo_claimed_for_dispatch",
            guard: ({ signal }) => {
              if (signal.type !== "tracker.state_observed") {
                return false;
              }

              const payload = signal.payload;
              if (!payload || typeof payload !== "object" || !("state" in payload)) {
                return false;
              }

              return payload.state === "Todo";
            },
            commands: ({ signal }) => [
              createSymphonyCurrentFlowTrackerTransitionCommand({
                id: `command_${signal.id}_tracker_bootstrapping`,
                dedupeKey: null,
                state: "Bootstrapping"
              })
            ]
          })
        ],
        strategy: createDeterministicStrategy(),
        createInitialData() {
          return {
            trackerState: null,
            confirmedTrackerState: null,
            lastObservedTrackerState: null,
            lastDispatchMode: null,
            lastDispatchStatus: null,
            lastRunMode: null,
            lastRuntimeOutcome: null,
            latestMergeResult: null,
            latestReworkHandoff: null
          };
        }
      });
    },
    createPolicy() {
      return {} as SymphonyCurrentFlowPolicy;
    }
  } satisfies WorkflowRouterPreset<
    SymphonyCurrentFlowNode,
    SymphonyCurrentFlowData,
    SymphonyCurrentFlowPolicy
  >;
  const router = await preset.createRouter();

  return {
    ...baselineRouting,
    router,
    policy: preset.createPolicy()
  };
}
