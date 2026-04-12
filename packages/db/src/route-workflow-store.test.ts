import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type {
  WorkflowProjection,
  WorkflowRouteResult
} from "@symphony/router";
import {
  SymphonyRouteWorkflowExistsError,
  SymphonyRouteWorkflowNotFoundError
} from "./errors.js";
import { createSymphonyIssueStore } from "./issues.js";
import { initializeSymphonyDb } from "./client.js";
import { createRouteWorkflowStore } from "./route-workflow-store.js";
import {
  symphonyGitHubInstallationIdentitiesTable,
  symphonyGitHubRepositoryIdentitiesTable,
  symphonyLinearWorkspaceIdentitiesTable,
  symphonyOrganizationsTable,
  symphonyRepositoryWorkspaceBindingsTable
} from "./schema.js";

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

function seedHostedRepositoryWorkspaceBinding(input: {
  database: ReturnType<typeof initializeSymphonyDb>;
  organizationId: string;
  linearWorkspaceIdentityId: string;
  repositoryWorkspaceBindingId: string;
  githubRepositoryIdentityId: string;
  repositoryKey: string;
  recordedAt: string;
}) {
  input.database.db.insert(symphonyOrganizationsTable).values({
    organizationId: input.organizationId,
    organizationSlug: input.organizationId,
    displayName: input.organizationId,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.database.db.insert(symphonyGitHubInstallationIdentitiesTable).values({
    githubInstallationIdentityId: `${input.organizationId}_installation_identity`,
    organizationId: input.organizationId,
    provider: "github",
    githubInstallationId: `${input.organizationId}_installation`,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.database.db.insert(symphonyGitHubRepositoryIdentitiesTable).values({
    githubRepositoryIdentityId: input.githubRepositoryIdentityId,
    organizationId: input.organizationId,
    githubInstallationIdentityId: `${input.organizationId}_installation_identity`,
    provider: "github",
    repositoryKey: input.repositoryKey,
    githubRepositoryId: `${input.githubRepositoryIdentityId}_repo`,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.database.db.insert(symphonyLinearWorkspaceIdentitiesTable).values({
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    organizationId: input.organizationId,
    provider: "linear",
    linearWorkspaceId: `${input.linearWorkspaceIdentityId}_workspace`,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.database.db.insert(symphonyRepositoryWorkspaceBindingsTable).values({
    repositoryWorkspaceBindingId: input.repositoryWorkspaceBindingId,
    organizationId: input.organizationId,
    githubInstallationIdentityId: `${input.organizationId}_installation_identity`,
    githubRepositoryIdentityId: input.githubRepositoryIdentityId,
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    source: "bootstrap",
    status: "active",
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();
}

type TestNode = "idle" | "bootstrapping";
type TestData = {
  phase: "idle" | "bootstrapping";
};
type TestPolicy = {
  mode: "implementation";
};

describe("route workflow store", () => {
  it("records route results as history, decisions, and the latest snapshot", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-workflow-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-300",
        trackerIssueId: "tracker-300",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-09T22:58:00.000Z"
      });

      const workflowId = await routeStore.createWorkflow({
        trackerIssueId: "tracker-300",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-300",
        routerPresetId: "current-flow",
        routerName: "symphony-current-flow",
        routerVersion: "1",
        createdAt: "2026-04-09T22:59:00.000Z"
      });

      const persisted = await routeStore.recordRouteResult({
        workflowId,
        policy: {
          mode: "implementation"
        },
        result: buildRouteResult(workflowId)
      });

      const workflow = await routeStore.getWorkflow(workflowId);
      const history = await routeStore.listHistory<TestNode>(workflowId);
      const decisions = await routeStore.listDecisions<TestNode, TestData, TestPolicy>(
        workflowId
      );
      const snapshot = await routeStore.getLatestSnapshot<TestNode, TestData>(
        workflowId
      );

      expect(workflow?.issueIdentifier).toBe("SYM-300");
      expect(workflow?.routerPresetId).toBe("current-flow");
      expect(persisted.history.map((event) => event.eventSequence)).toEqual([1, 2, 3, 4]);
      expect(history.map((event) => event.kind)).toEqual([
        "signal_recorded",
        "decision_recorded",
        "command_emitted",
        "command_emitted"
      ]);
      expect(persisted.decision.eventSequence).toBe(2);
      expect(decisions[0]?.reasonCode).toBe("todo_claimed_for_dispatch");
      expect(decisions[0]?.projectionAfter.pendingCommands).toHaveLength(2);
      expect(snapshot?.eventSequence).toBe(4);
      expect(snapshot?.currentNode).toBe("bootstrapping");
      expect(snapshot?.projection.pendingCommands.map((command) => command.id)).toEqual([
        "command_tracker_bootstrapping",
        "command_dispatch_implementation"
      ]);
    } finally {
      database.close();
    }
  });

  it("appends later history events and advances the latest snapshot", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-snapshot-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-301",
        trackerIssueId: "tracker-301",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-09T22:58:00.000Z"
      });

      const workflowId = await routeStore.createWorkflow({
        trackerIssueId: "tracker-301",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-301",
        routerPresetId: "current-flow",
        routerName: "symphony-current-flow",
        routerVersion: "1",
        createdAt: "2026-04-09T22:59:00.000Z"
      });

      await routeStore.recordRouteResult({
        workflowId,
        policy: {
          mode: "implementation"
        },
        result: buildRouteResult(workflowId)
      });

      const appended = await routeStore.appendHistoryEventWithSnapshot<TestNode, TestData>({
        workflowId,
        event: {
          kind: "command_settled",
          commandId: "command_tracker_bootstrapping",
          status: "succeeded",
          payload: null,
          recordedAt: "2026-04-09T23:05:00.000Z"
        },
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
          lastDecision: buildRouteResult(workflowId).decision,
          sequence: 5
        })
      });

      expect(appended.historyEvent.eventSequence).toBe(5);
      expect(appended.snapshot?.eventSequence).toBe(5);
      expect(appended.snapshot?.projection.pendingCommands.map((command) => command.id)).toEqual([
        "command_dispatch_implementation"
      ]);
    } finally {
      database.close();
    }
  });

  it("loads hydration state from the latest snapshot plus later tail history", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-hydration-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-301A",
        trackerIssueId: "tracker-301A",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-09T22:58:00.000Z"
      });

      const workflowId = await routeStore.createWorkflow({
        trackerIssueId: "tracker-301A",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-301A",
        routerPresetId: "current-flow",
        routerName: "symphony-current-flow",
        routerVersion: "1",
        createdAt: "2026-04-09T22:59:00.000Z"
      });

      await routeStore.recordRouteResult({
        workflowId,
        policy: {
          mode: "implementation"
        },
        result: buildRouteResult(workflowId)
      });

      await routeStore.appendHistoryEvent<TestNode>({
        workflowId,
        event: {
          kind: "command_settled",
          commandId: "command_tracker_bootstrapping",
          status: "succeeded",
          payload: null,
          recordedAt: "2026-04-09T23:05:00.000Z"
        }
      });

      const historyTail = await routeStore.listHistoryAfter<TestNode>({
        workflowId,
        afterEventSequence: 4
      });
      const hydrationState = await routeStore.loadWorkflowHydrationState<
        TestNode,
        TestData,
        TestPolicy
      >(workflowId);
      const hydrationStateByIssue = await routeStore.loadWorkflowHydrationStateByIssue<
        TestNode,
        TestData,
        TestPolicy
      >("SYM-301A");

      expect(historyTail).toHaveLength(1);
      expect(historyTail[0]?.eventSequence).toBe(5);
      expect(historyTail[0]?.kind).toBe("command_settled");

      expect(hydrationState?.workflow.workflowId).toBe(workflowId);
      expect(hydrationState?.tailAfterEventSequence).toBe(4);
      expect(hydrationState?.snapshot?.eventSequence).toBe(4);
      expect(hydrationState?.tailHistory.map((event) => event.eventSequence)).toEqual([5]);
      expect(hydrationState?.tailHistory[0]?.commandId).toBe("command_tracker_bootstrapping");
      expect(hydrationState?.latestDecision?.decisionId).toBe("decision_bootstrap");

      expect(hydrationStateByIssue).toEqual(hydrationState);
    } finally {
      database.close();
    }
  });

  it("keeps hosted workflows isolated from the unscoped issue lookup path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-scoped-hydration-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      seedHostedRepositoryWorkspaceBinding({
        database,
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_001",
        repositoryWorkspaceBindingId: "repository_workspace_binding_001",
        githubRepositoryIdentityId: "github_repository_identity_001",
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-09T22:57:00.000Z"
      });

      await issueStore.upsert({
        issueIdentifier: "SYM-301S",
        trackerIssueId: "tracker-301S",
        repositoryKey: "openai/symphony",
        bindingScope: {
          organizationId: "org_001",
          linearWorkspaceIdentityId: "linear_workspace_identity_001"
        },
        repositoryWorkspaceBindingId: "repository_workspace_binding_001",
        latestRunStartedAt: null,
        recordedAt: "2026-04-09T22:58:00.000Z"
      });

      const workflowId = await routeStore.createWorkflow({
        trackerIssueId: "tracker-301S",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-301S",
        bindingScope: {
          organizationId: "org_001",
          linearWorkspaceIdentityId: "linear_workspace_identity_001"
        },
        routerPresetId: "current-flow",
        routerName: "symphony-current-flow",
        routerVersion: "1",
        createdAt: "2026-04-09T22:59:00.000Z"
      });

      await routeStore.recordRouteResult({
        workflowId,
        policy: {
          mode: "implementation"
        },
        result: buildRouteResult(workflowId)
      });

      const unscopedWorkflow = await routeStore.getWorkflowForIssue("SYM-301S");
      const scopedWorkflow = await routeStore.getWorkflowForScopedIssue({
        issueIdentifier: "SYM-301S",
        bindingScope: {
          organizationId: "org_001",
          linearWorkspaceIdentityId: "linear_workspace_identity_001"
        }
      });
      const unscopedHydration = await routeStore.loadWorkflowHydrationStateByIssue<
        TestNode,
        TestData,
        TestPolicy
      >("SYM-301S");
      const scopedHydration = await routeStore.loadWorkflowHydrationStateByScopedIssue<
        TestNode,
        TestData,
        TestPolicy
      >({
        issueIdentifier: "SYM-301S",
        bindingScope: {
          organizationId: "org_001",
          linearWorkspaceIdentityId: "linear_workspace_identity_001"
        }
      });

      expect(unscopedWorkflow).toBeNull();
      expect(unscopedHydration).toBeNull();
      expect(scopedWorkflow?.workflowId).toBe(workflowId);
      expect(scopedWorkflow?.bindingScope).toEqual({
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_001"
      });
      expect(scopedHydration?.workflow.workflowId).toBe(workflowId);
      expect(scopedHydration?.workflow.bindingScope).toEqual({
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_001"
      });
    } finally {
      database.close();
    }
  });

  it("loads empty hydration state for a workflow before any route history exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-empty-hydration-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-301B",
        trackerIssueId: "tracker-301B",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-09T22:58:00.000Z"
      });

      const workflowId = await routeStore.createWorkflow({
        trackerIssueId: "tracker-301B",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-301B",
        routerPresetId: "current-flow",
        routerName: "symphony-current-flow",
        routerVersion: "1",
        createdAt: "2026-04-09T22:59:00.000Z"
      });

      const hydrationState = await routeStore.loadWorkflowHydrationState<
        TestNode,
        TestData,
        TestPolicy
      >(workflowId);

      expect(hydrationState?.workflow.workflowId).toBe(workflowId);
      expect(hydrationState?.snapshot).toBeNull();
      expect(hydrationState?.tailAfterEventSequence).toBe(0);
      expect(hydrationState?.tailHistory).toEqual([]);
      expect(hydrationState?.latestDecision).toBeNull();
    } finally {
      database.close();
    }
  });

  it("cascades issue identifier updates into existing workflow rows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-rename-cascade-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-301C",
        trackerIssueId: "tracker-301C",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-09T22:58:00.000Z"
      });

      const workflowId = await routeStore.createWorkflow({
        trackerIssueId: "tracker-301C",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-301C",
        routerPresetId: "current-flow",
        routerName: "symphony-current-flow",
        routerVersion: "1",
        createdAt: "2026-04-09T22:59:00.000Z"
      });

      await issueStore.upsert({
        issueIdentifier: "SYM-301C-RENAMED",
        trackerIssueId: "tracker-301C",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-09T23:00:00.000Z"
      });

      await expect(routeStore.getWorkflowForIssue("SYM-301C")).resolves.toBeNull();
      await expect(routeStore.getWorkflow(workflowId)).resolves.toMatchObject({
        workflowId,
        issueIdentifier: "SYM-301C-RENAMED"
      });
      await expect(
        routeStore.getWorkflowForIssue("SYM-301C-RENAMED")
      ).resolves.toMatchObject({
        workflowId,
        issueIdentifier: "SYM-301C-RENAMED"
      });
    } finally {
      database.close();
    }
  });

  it("raises an explicit error when a second active workflow is created for the same issue", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-duplicate-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-302",
        trackerIssueId: "tracker-302",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-09T22:58:00.000Z"
      });

      await routeStore.createWorkflow({
        trackerIssueId: "tracker-302",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-302",
        routerPresetId: "current-flow",
        routerName: "router-a",
        routerVersion: "1",
        createdAt: "2026-04-09T22:59:00.000Z"
      });

      await expect(
        routeStore.createWorkflow({
          trackerIssueId: "tracker-302",
          repositoryKey: "openai/symphony",
          issueIdentifier: "SYM-302",
          routerPresetId: "alternate-flow",
          routerName: "router-b",
          routerVersion: "1",
          createdAt: "2026-04-09T22:59:01.000Z"
        })
      ).rejects.toBeInstanceOf(SymphonyRouteWorkflowExistsError);
    } finally {
      database.close();
    }
  });

  it("fails fast when recording a route result for an unknown workflow", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-missing-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await expect(
        routeStore.recordRouteResult({
          workflowId: "workflow-missing",
          policy: {
            mode: "implementation"
          },
          result: buildRouteResult("workflow-missing")
        })
      ).rejects.toBeInstanceOf(SymphonyRouteWorkflowNotFoundError);
    } finally {
      database.close();
    }
  });

  it("returns null hydration state when the workflow does not exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-hydration-missing-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await expect(
        routeStore.loadWorkflowHydrationState<TestNode, TestData, TestPolicy>(
          "workflow-missing"
        )
      ).resolves.toBeNull();
      await expect(
        routeStore.loadWorkflowHydrationStateByIssue<TestNode, TestData, TestPolicy>(
          "SYM-MISSING"
        )
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
    recordedAt: "2026-04-09T23:00:00.000Z",
    signal: {
      id: "signal_todo_observed",
      type: "tracker.state_observed",
      source: "tracker" as const,
      occurredAt: "2026-04-09T23:00:00.000Z",
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
      pendingCommandIds: []
    }),
    signalEvent,
    decision,
    events: [
      signalEvent,
      {
        kind: "decision_recorded" as const,
        recordedAt: "2026-04-09T23:00:01.000Z",
        decision
      },
      {
        kind: "command_emitted" as const,
        decisionId: decision.id,
        recordedAt: "2026-04-09T23:00:01.500Z",
        command: decision.commands[0]!
      },
      {
        kind: "command_emitted" as const,
        decisionId: decision.id,
        recordedAt: "2026-04-09T23:00:02.000Z",
        command: decision.commands[1]!
      }
    ],
    projectionAfter: buildProjection({
      workflowId,
      phase: "bootstrapping",
      recordedSignalIds: ["signal_todo_observed"],
      emittedCommandIds: [
        "command_tracker_bootstrapping",
        "command_dispatch_implementation"
      ],
      lastSignal: signalEvent.signal,
      lastDecision: decision,
      pendingCommandIds: [
        "command_tracker_bootstrapping",
        "command_dispatch_implementation"
      ]
    })
  };
}

function buildProjection(input: {
  workflowId: string;
  phase: TestData["phase"];
  pendingCommandIds: string[];
  recordedSignalIds?: string[];
  emittedCommandIds?: string[];
  lastSignal?: WorkflowProjection<TestNode, TestData>["lastSignal"];
  lastDecision?: WorkflowProjection<TestNode, TestData>["lastDecision"];
  sequence?: number;
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
    recordedSignalIds: input.recordedSignalIds ?? [],
    emittedCommandIds: input.emittedCommandIds ?? input.pendingCommandIds,
    terminal: false,
    sequence: input.sequence ?? input.pendingCommandIds.length,
    data: {
      phase: input.phase
    },
    lastSignal: input.lastSignal ?? null,
    lastDecision: input.lastDecision ?? null
  };
}
