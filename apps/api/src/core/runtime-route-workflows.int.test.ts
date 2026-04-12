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
  createSymphonyCurrentFlowRunStartedSignal,
  createSymphonyCurrentFlowTrackerStateObservedSignal,
  createSymphonyCurrentFlowRouterAsync,
  createDeterministicStrategy,
  createWorkflowRouterAsync,
  WorkflowEdge,
  WorkflowNode,
  type SymphonyCurrentFlowData,
  type SymphonyCurrentFlowNode,
  type SymphonyCurrentFlowPolicy,
  type WorkflowRouter
} from "@symphony/router";
import type {
  WorkflowProjection,
  WorkflowRouteResult
} from "@symphony/router";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";

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

type TestNode = "idle" | "bootstrapping" | "review";
type TestData = {
  phase: TestNode;
};
type TestPolicy = {
  mode: "implementation";
};

describe("runtime route workflows", () => {
  it("ensures a workflow and records route results through the port", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-route-port-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-410",
        trackerIssueId: "tracker-410",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:28:00.000Z"
      });

      const ensured = await routeWorkflows.ensureWorkflowForIssue({
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-410",
        routerPresetId: "current-flow",
        router: await createSymphonyCurrentFlowRouterAsync(),
        createdAt: "2026-04-10T00:29:00.000Z"
      });
      const workflowId = ensured.workflow.workflowId;

      const recorded = await routeWorkflows.recordRouteResult({
        workflowId,
        policy: {
          mode: "implementation"
        },
        result: buildRouteResult(workflowId)
      });

      const ensuredAgain = await routeWorkflows.ensureWorkflowForIssue({
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-410",
        routerPresetId: "current-flow",
        router: await createSymphonyCurrentFlowRouterAsync(),
        createdAt: "2026-04-10T00:29:30.000Z"
      });

      const byWorkflowId = await routeWorkflows.loadHydrationStateByWorkflowId<
        TestNode,
        TestData,
        TestPolicy
      >(workflowId);
      const byIssueIdentifier = await routeWorkflows.loadHydrationStateByIssueIdentifier<
        TestNode,
        TestData,
        TestPolicy
      >("SYM-410");
      const replayByWorkflowId = await routeWorkflows.loadReplayStateByWorkflowId<
        TestNode
      >(workflowId);
      const replayByIssueIdentifier =
        await routeWorkflows.loadReplayStateByIssueIdentifier<TestNode>("SYM-410");

      expect(ensured.created).toBe(true);
      expect(ensured.workflow.routerPresetId).toBe("current-flow");
      expect(ensured.workflow.routerName).toBe("symphony-current-flow");
      expect(ensuredAgain.created).toBe(false);
      expect(recorded.decision.decisionId).toBe("decision_bootstrap");
      expect(byWorkflowId?.workflow.workflowId).toBe(workflowId);
      expect(byWorkflowId?.workflow.routerPresetId).toBe("current-flow");
      expect(byWorkflowId?.snapshot?.projection.currentNode).toBe("bootstrapping");
      expect(byWorkflowId?.snapshot?.projection.recordedSignalIds).toEqual([
        "signal_todo_observed"
      ]);
      expect(byWorkflowId?.latestDecision?.decisionId).toBe("decision_bootstrap");
      expect(byIssueIdentifier).toEqual(byWorkflowId);
      expect(replayByWorkflowId?.history.map((entry) => entry.kind)).toEqual([
        "signal_recorded",
        "decision_recorded",
        "command_emitted",
        "command_emitted"
      ]);
      expect(replayByWorkflowId?.signals.map((signal) => signal.id)).toEqual([
        "signal_todo_observed"
      ]);
      expect(replayByIssueIdentifier).toEqual(replayByWorkflowId);
    } finally {
      database.close();
    }
  });

  it("loads hosted workflows only through the matching workspace scope", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-route-scoped-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-410S",
        trackerIssueId: "tracker-410S",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:28:00.000Z"
      });

      const ensured = await routeWorkflows.ensureWorkflowForIssue({
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-410S",
        bindingScope: {
          organizationId: "org_001",
          linearWorkspaceIdentityId: "linear_workspace_identity_001"
        },
        routerPresetId: "current-flow",
        router: await createSymphonyCurrentFlowRouterAsync(),
        createdAt: "2026-04-10T00:29:00.000Z"
      });

      await routeWorkflows.recordRouteResult({
        workflowId: ensured.workflow.workflowId,
        policy: {
          mode: "implementation"
        },
        result: buildRouteResult(ensured.workflow.workflowId)
      });

      const unscopedHydration =
        await routeWorkflows.loadHydrationStateByIssueIdentifier<
          TestNode,
          TestData,
          TestPolicy
        >("SYM-410S");
      const scopedHydration = await routeWorkflows.loadHydrationStateByScopedIssue<
        TestNode,
        TestData,
        TestPolicy
      >({
        issueIdentifier: "SYM-410S",
        bindingScope: {
          organizationId: "org_001",
          linearWorkspaceIdentityId: "linear_workspace_identity_001"
        }
      });
      const replayByScope = await routeWorkflows.loadReplayStateByScopedIssue<TestNode>({
        issueIdentifier: "SYM-410S",
        bindingScope: {
          organizationId: "org_001",
          linearWorkspaceIdentityId: "linear_workspace_identity_001"
        }
      });

      expect(unscopedHydration).toBeNull();
      expect(scopedHydration?.workflow.bindingScope).toEqual({
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_001"
      });
      expect(replayByScope?.workflow.workflowId).toBe(ensured.workflow.workflowId);
      expect(replayByScope?.workflow.bindingScope).toEqual({
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_001"
      });
    } finally {
      database.close();
    }
  });

  it("rejects workflow reuse when the existing router metadata does not match", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-route-mismatch-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-410A",
        trackerIssueId: "tracker-410A",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:28:00.000Z"
      });

      await routeWorkflowStore.createWorkflow({
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-410A",
        routerPresetId: "current-flow",
        routerName: "custom-router",
        routerVersion: "9",
        createdAt: "2026-04-10T00:29:00.000Z"
      });

      await expect(
        routeWorkflows.ensureWorkflowForIssue({
          repositoryKey: "openai/symphony",
          issueIdentifier: "SYM-410A",
          routerPresetId: "current-flow",
          router: await createSymphonyCurrentFlowRouterAsync(),
          createdAt: "2026-04-10T00:29:30.000Z"
        })
      ).rejects.toThrow(
        "is bound to router custom-router"
      );
    } finally {
      database.close();
    }
  });

  it("rejects workflow reuse when the stored router preset id does not match", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-route-preset-mismatch-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-410B",
        trackerIssueId: "tracker-410B",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:28:00.000Z"
      });

      await routeWorkflowStore.createWorkflow({
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-410B",
        routerPresetId: "alternate-flow",
        routerName: "symphony-current-flow",
        routerVersion: "1",
        createdAt: "2026-04-10T00:29:00.000Z"
      });

      await expect(
        routeWorkflows.ensureWorkflowForIssue({
          repositoryKey: "openai/symphony",
          issueIdentifier: "SYM-410B",
          routerPresetId: "current-flow",
          router: await createSymphonyCurrentFlowRouterAsync(),
          createdAt: "2026-04-10T00:29:30.000Z"
        })
      ).rejects.toThrow("is bound to router preset alternate-flow");
    } finally {
      database.close();
    }
  });

  it("rehydrates a persisted projection from the latest snapshot plus tail history", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-route-rehydrate-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });
    const router = await createTestRouter();

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-411",
        trackerIssueId: "tracker-411",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:30:00.000Z"
      });

      const ensured = await routeWorkflows.ensureWorkflowForIssue({
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-411",
        routerPresetId: "test-flow",
        router,
        createdAt: "2026-04-10T00:29:00.000Z"
      });
      const workflowId = ensured.workflow.workflowId;

      await routeWorkflows.recordRouteResult({
        workflowId,
        policy: {
          mode: "implementation"
        },
        result: buildRouteResult(workflowId)
      });
      await routeWorkflows.appendCommandSettlement<TestNode, TestData>({
        workflowId,
        commandId: "command_tracker_bootstrapping",
        status: "succeeded",
        payload: null,
        recordedAt: "2026-04-10T00:31:00.000Z",
        projection: buildProjection({
          workflowId,
          phase: "bootstrapping",
          pendingCommandIds: ["command_dispatch_implementation"],
          recordedSignalIds: ["signal_todo_observed"],
          emittedCommandIds: [
            "command_tracker_bootstrapping",
            "command_dispatch_implementation"
          ],
          lastSignal: buildRouteResult(workflowId).signalEvent.signal,
          lastDecision: buildRouteResult(workflowId).decision
        })
      });

      const rehydrated = await routeWorkflows.rehydrateProjectionByWorkflowId<
        TestNode,
        TestData,
        TestPolicy
      >({
        workflowId,
        router,
        policy: {
          mode: "implementation"
        }
      });

      expect(rehydrated?.policy).toEqual({
        mode: "implementation"
      });
      expect(rehydrated?.projection.currentNode).toBe("bootstrapping");
      expect(rehydrated?.projection.pendingCommands.map((command) => command.id)).toEqual([
        "command_dispatch_implementation"
      ]);
    } finally {
      database.close();
    }
  });

  it("does not let a stale command settlement overwrite a newer workflow snapshot", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-route-stale-settlement-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });
    const router = await createSymphonyCurrentFlowRouterAsync({
      now: () => new Date("2026-04-10T00:30:00.000Z"),
      createId: (() => {
        let counter = 0;
        return (prefix: string) =>
          `${prefix}_${String(++counter).padStart(4, "0")}`;
      })()
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-411A",
        trackerIssueId: "tracker-411A",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:29:00.000Z"
      });

      const ensured = await routeWorkflows.ensureWorkflowForIssue({
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-411A",
        routerPresetId: "current-flow",
        router,
        createdAt: "2026-04-10T00:29:30.000Z"
      });
      const workflowId = ensured.workflow.workflowId;
      const initialSession = await router.startSessionAsync({
        workflowId,
        policy: {}
      });

      const bootstrapResult = await initialSession.receiveAsync(
        createSymphonyCurrentFlowTrackerStateObservedSignal({
          id: "signal_todo_observed",
          occurredAt: "2026-04-10T00:30:00.000Z",
          state: "Todo",
          runId: null,
          runMode: null,
          causationId: null,
          correlationId: "SYM-411A"
        })
      );
      await routeWorkflows.recordRouteResult({
        workflowId,
        policy: {},
        result: bootstrapResult
      });

      const trackerTransitionCommand = bootstrapResult.decision.commands.find(
        (command) => command.kind === "tracker.transition"
      );
      const dispatchCommand = bootstrapResult.decision.commands.find(
        (command) => command.kind === "run.dispatch"
      );
      if (!trackerTransitionCommand || !dispatchCommand) {
        throw new TypeError("Expected current-flow bootstrap to emit tracker and dispatch commands.");
      }

      const trackerSettledProjection = await initialSession.settleCommandAsync({
        commandId: trackerTransitionCommand.id,
        status: "succeeded",
        payload: null,
        recordedAt: "2026-04-10T00:30:01.000Z"
      });
      await routeWorkflows.appendCommandSettlement({
        workflowId,
        commandId: trackerTransitionCommand.id,
        status: "succeeded",
        payload: null,
        recordedAt: "2026-04-10T00:30:01.000Z",
        projection: trackerSettledProjection
      });

      const resumed = await routeWorkflows.resumeSessionByWorkflowId<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        workflowId,
        router,
        policy: {}
      });
      if (!resumed) {
        throw new TypeError(`Expected resumed workflow session for ${workflowId}.`);
      }

      const runStartedResult = await resumed.session.receiveAsync(
        createSymphonyCurrentFlowRunStartedSignal({
          id: "signal_run_started",
          occurredAt: "2026-04-10T00:30:02.000Z",
          runId: "run-411A",
          runMode: "implementation",
          causationId: "run-411A",
          correlationId: "SYM-411A"
        })
      );
      await routeWorkflows.recordRouteResult({
        workflowId,
        policy: {},
        result: runStartedResult
      });
      const inProgressCommand = runStartedResult.decision.commands.find(
        (command) => command.kind === "tracker.transition"
      );
      if (!inProgressCommand) {
        throw new TypeError("Expected run start activation to emit an In Progress tracker transition.");
      }
      const runStartedSettledProjection = await resumed.session.settleCommandAsync({
        commandId: inProgressCommand.id,
        status: "succeeded",
        payload: null,
        recordedAt: "2026-04-10T00:30:02.500Z"
      });
      await routeWorkflows.appendCommandSettlement({
        workflowId,
        commandId: inProgressCommand.id,
        status: "succeeded",
        payload: null,
        recordedAt: "2026-04-10T00:30:02.500Z",
        projection: runStartedSettledProjection
      });

      const staleDispatchProjection = await initialSession.settleCommandAsync({
        commandId: dispatchCommand.id,
        status: "succeeded",
        payload: null,
        recordedAt: "2026-04-10T00:30:03.000Z"
      });
      await routeWorkflows.appendCommandSettlement({
        workflowId,
        commandId: dispatchCommand.id,
        status: "succeeded",
        payload: null,
        recordedAt: "2026-04-10T00:30:03.000Z",
        projection: staleDispatchProjection
      });

      const hydration = await routeWorkflows.loadHydrationStateByWorkflowId<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(workflowId);
      expect(hydration?.snapshot?.projection.currentNode).toBe("implementation");
      expect(hydration?.snapshot?.projection.data.trackerState).toBe("In Progress");
      expect(hydration?.tailHistory.map((entry) => entry.kind)).toEqual([
        "command_settled"
      ]);
      expect(hydration?.tailHistory[0]?.commandId).toBe(dispatchCommand.id);

      const rehydrated = await routeWorkflows.rehydrateProjectionByWorkflowId<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        workflowId,
        router,
        policy: {}
      });
      expect(rehydrated?.projection.currentNode).toBe("implementation");
      expect(rehydrated?.projection.pendingCommands).toEqual([]);
      expect(rehydrated?.projection.data.lastDispatchStatus).toBe("succeeded");
    } finally {
      database.close();
    }
  });

  it("resumes a persisted workflow session and continues routing from hydrated state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-route-resume-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });
    const router = await createTestRouter();

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-412",
        trackerIssueId: "tracker-412",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:31:00.000Z"
      });

      const ensured = await routeWorkflows.ensureWorkflowForIssue({
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-412",
        routerPresetId: "test-flow",
        router,
        createdAt: "2026-04-10T00:29:00.000Z"
      });
      const workflowId = ensured.workflow.workflowId;

      await routeWorkflows.recordRouteResult({
        workflowId,
        policy: {
          mode: "implementation"
        },
        result: buildRouteResult(workflowId)
      });

      const resumed = await routeWorkflows.resumeSessionByIssueIdentifier<
        TestNode,
        TestData,
        TestPolicy
      >({
        issueIdentifier: "SYM-412",
        router,
        policy: {
          mode: "implementation"
        }
      });

      const result = await resumed?.session.receiveAsync({
        id: "signal_workflow_review_requested",
        type: "workflow.review_requested",
        source: "runtime",
        occurredAt: "2026-04-10T15:00:00.000Z",
        payload: null,
        causationId: null,
        correlationId: "SYM-412"
      });

      expect(resumed?.projection.currentNode).toBe("bootstrapping");
      expect(result?.projectionAfter.currentNode).toBe("review");
      expect(result?.projectionAfter.data.phase).toBe("review");
    } finally {
      database.close();
    }
  });

  it("fails fast when callers omit routing policy during rehydration", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-route-policy-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });
    const router = await createTestRouter();

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-413",
        trackerIssueId: "tracker-413",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:32:00.000Z"
      });

      const ensured = await routeWorkflows.ensureWorkflowForIssue({
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-413",
        routerPresetId: "test-flow",
        router,
        createdAt: "2026-04-10T00:29:00.000Z"
      });
      const workflowId = ensured.workflow.workflowId;

      await expect(
        routeWorkflows.rehydrateProjectionByWorkflowId({
          workflowId,
          router
        } as never)
      ).rejects.toThrow(
        "requires an explicit routing policy"
      );

      const rehydrated = await routeWorkflows.rehydrateProjectionByWorkflowId<
        TestNode,
        TestData,
        TestPolicy
      >({
        workflowId,
        router,
        policy: {
          mode: "implementation"
        }
      });

      expect(rehydrated?.projection.currentNode).toBe("idle");
      expect(rehydrated?.projection.pendingCommands).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("returns null when no persisted route workflow exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-route-port-null-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore: createRouteWorkflowStore(database.db)
    });

    try {
      await expect(
        routeWorkflows.loadHydrationStateByWorkflowId("workflow-missing")
      ).resolves.toBeNull();
      await expect(
        routeWorkflows.loadHydrationStateByIssueIdentifier("SYM-MISSING")
      ).resolves.toBeNull();
      await expect(
        routeWorkflows.rehydrateProjectionByWorkflowId<
          TestNode,
          TestData,
          TestPolicy
        >({
          workflowId: "workflow-missing",
          router: await createTestRouter(),
          policy: {
            mode: "implementation"
          }
        })
      ).resolves.toBeNull();
    } finally {
      database.close();
    }
  });
});

function buildRouteResult(
  workflowId: string
): WorkflowRouteResult<TestNode, TestData> {
  const signalEvent = {
    kind: "signal_recorded" as const,
    recordedAt: "2026-04-10T00:30:00.000Z",
    signal: {
      id: "signal_todo_observed",
      type: "tracker.state_observed",
      source: "tracker" as const,
      occurredAt: "2026-04-10T00:30:00.000Z",
      causationId: null,
      correlationId: null,
      payload: {
        state: "Todo"
      }
    }
  };

  const decision = {
    id: "decision_bootstrap",
    fromNode: "idle" as const,
    toNode: "bootstrapping" as const,
    edgeId: "idle_todo_to_bootstrapping",
    reasonCode: "todo_claimed_for_dispatch",
    commands: [
      {
        id: "command_tracker_bootstrapping",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Bootstrapping"
        }
      },
      {
        id: "command_dispatch_implementation",
        kind: "run.dispatch",
        dedupeKey: null,
        payload: {
          runMode: "implementation"
        }
      }
    ],
    trace: [
      {
        kind: "signal_received" as const,
        ref: "signal_todo_observed",
        detail: null
      },
      {
        kind: "strategy_selected" as const,
        ref: "idle_todo_to_bootstrapping",
        detail: null
      }
    ],
    selectionMetadata: null
  };

  return {
    projectionBefore: buildProjection({
      workflowId,
      phase: "idle",
      pendingCommandIds: [],
      recordedSignalIds: [],
      emittedCommandIds: []
    }),
    signalEvent,
    decision,
    events: [
      signalEvent,
      {
        kind: "decision_recorded" as const,
        recordedAt: "2026-04-10T00:30:01.000Z",
        decision
      },
      {
        kind: "command_emitted" as const,
        decisionId: decision.id,
        recordedAt: "2026-04-10T00:30:01.500Z",
        command: decision.commands[0]!
      },
      {
        kind: "command_emitted" as const,
        decisionId: decision.id,
        recordedAt: "2026-04-10T00:30:02.000Z",
        command: decision.commands[1]!
      }
    ],
    projectionAfter: buildProjection({
      workflowId,
      phase: "bootstrapping",
      pendingCommandIds: [
        "command_tracker_bootstrapping",
        "command_dispatch_implementation"
      ],
      recordedSignalIds: ["signal_todo_observed"],
      emittedCommandIds: [
        "command_tracker_bootstrapping",
        "command_dispatch_implementation"
      ],
      lastSignal: signalEvent.signal,
      lastDecision: decision
    })
  };
}

async function createTestRouter(): Promise<
  WorkflowRouter<TestNode, TestData, TestPolicy>
> {
  return await createWorkflowRouterAsync<TestNode, TestData, TestPolicy>({
    name: "runtime-route-workflows-test",
    version: "1",
    initialNode: "idle",
    nodes: [
      new WorkflowNode<TestNode, TestData, TestPolicy>("idle"),
      new WorkflowNode<TestNode, TestData, TestPolicy>("bootstrapping"),
      new WorkflowNode<TestNode, TestData, TestPolicy>("review")
    ],
    edges: [
      new WorkflowEdge<TestNode, TestData, TestPolicy>({
        id: "bootstrapping_to_review",
        from: "bootstrapping",
        to: "review",
        reasonCode: "review_requested",
        guard: ({ signal }) => signal.type === "workflow.review_requested"
      })
    ],
    strategy: createDeterministicStrategy<TestNode, TestData, TestPolicy>(),
    createInitialData() {
      return {
        phase: "idle"
      };
    },
    reduceData({ data, event }) {
      if (event.kind !== "decision_recorded") {
        return data;
      }

      return {
        phase: event.decision.toNode ?? data.phase
      };
    }
  });
}

function buildProjection(input: {
  workflowId: string;
  phase: TestData["phase"];
  pendingCommandIds: string[];
  recordedSignalIds: string[];
  emittedCommandIds: string[];
  lastSignal?: WorkflowProjection<TestNode, TestData>["lastSignal"];
  lastDecision?: WorkflowProjection<TestNode, TestData>["lastDecision"];
}): WorkflowProjection<TestNode, TestData> {
  return {
    workflowId: input.workflowId,
    currentNode: input.phase,
    pendingCommands: input.pendingCommandIds.map((commandId) => ({
      id: commandId,
      kind: commandId.startsWith("command_tracker_")
        ? "tracker.transition"
        : "run.dispatch",
      dedupeKey: null,
      payload:
        commandId === "command_tracker_bootstrapping"
          ? {
              state: "Bootstrapping"
            }
          : {
              runMode: "implementation"
            }
    })),
    recordedSignalIds: input.recordedSignalIds,
    emittedCommandIds: input.emittedCommandIds,
    terminal: false,
    sequence: input.pendingCommandIds.length,
    data: {
      phase: input.phase
    },
    lastSignal: input.lastSignal ?? null,
    lastDecision: input.lastDecision ?? null
  };
}
