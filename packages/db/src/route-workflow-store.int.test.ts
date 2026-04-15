import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type {
  WorkflowProjection,
  WorkflowRouteResult
} from "@symphony/router";
import {
  createSymphonyCapabilityExecutionCommand,
  createSymphonyIntelligentFlowRouterDecision,
  createSymphonyTicketExecutionContract
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
        routerPresetId: "intelligent-flow",
        routerName: "symphony-intelligent-flow",
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
      expect(workflow?.routerPresetId).toBe("intelligent-flow");
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
        routerPresetId: "intelligent-flow",
        routerName: "symphony-intelligent-flow",
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
        routerPresetId: "intelligent-flow",
        routerName: "symphony-intelligent-flow",
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

  it("persists canonical execution contracts separately from workflow history", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-contract-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-312",
        trackerIssueId: "tracker-312",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-13T06:00:00.000Z"
      });

      const workflowId = await routeStore.createWorkflow({
        trackerIssueId: "tracker-312",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-312",
        routerPresetId: "intelligent-flow",
        routerName: "symphony-intelligent-flow",
        routerVersion: "1",
        createdAt: "2026-04-13T06:01:00.000Z"
      });

      const saved = await routeStore.saveExecutionContract({
        workflowId,
        contract: createSymphonyTicketExecutionContract({
          contractId: "contract_workflow_312",
          workflowId,
          issueIdentifier: "SYM-312",
          repositoryKey: "openai/symphony",
          summary: "Persist the first workflow execution contract.",
          objective: "Create a durable API-side capability contract artifact.",
          doneDefinition:
            "The canonical contract is stored in control-plane data and can be reloaded.",
          routingDirectives: {
            requiredCapabilityIds: ["implement.spec", "critic.code_review"],
            preferredCapabilityIds: ["critic.adversarial_tests"],
            forbiddenCapabilityIds: ["critic.browser_test"],
            requiredEvidenceIds: ["change_set", "code_review_report"],
            allowedModelProfileIds: [
              "builder_fast",
              "builder_deep",
              "critic_strict",
              "critic_adversarial"
            ],
            clarificationPolicy: {
              mode: "required"
            },
            reviewStrictness: "strict",
            maxRetryCount: 2
          },
          createdAt: "2026-04-13T06:02:00.000Z",
          updatedAt: "2026-04-13T06:02:00.000Z"
        }),
        recordedAt: "2026-04-13T06:02:00.000Z"
      });

      const loaded = await routeStore.getExecutionContract(workflowId);

      expect(saved).toEqual({
        contractId: "contract_workflow_312",
        workflowId,
        issueIdentifier: "SYM-312",
        repositoryKey: "openai/symphony",
        summary: "Persist the first workflow execution contract.",
        objective: "Create a durable API-side capability contract artifact.",
        doneDefinition:
          "The canonical contract is stored in control-plane data and can be reloaded.",
        routingDirectives: {
          requiredCapabilityIds: ["implement.spec", "critic.code_review"],
          preferredCapabilityIds: ["critic.adversarial_tests"],
          forbiddenCapabilityIds: ["critic.browser_test"],
          requiredEvidenceIds: ["change_set", "code_review_report"],
          allowedModelProfileIds: [
            "builder_fast",
            "builder_deep",
            "critic_strict",
            "critic_adversarial"
          ],
          clarificationPolicy: {
            mode: "required"
          },
          reviewStrictness: "strict",
          maxRetryCount: 2
        },
        createdAt: "2026-04-13T06:02:00.000Z",
        updatedAt: "2026-04-13T06:02:00.000Z",
        insertedAt: "2026-04-13T06:02:00.000Z"
      });
      expect(loaded).toEqual(saved);
      expect(await routeStore.listHistory(workflowId)).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("persists capability planner decisions and emitted commands separately from workflow history", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-capability-plan-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-313",
        trackerIssueId: "tracker-313",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-13T06:05:00.000Z"
      });

      const workflowId = await routeStore.createWorkflow({
        trackerIssueId: "tracker-313",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-313",
        routerPresetId: "intelligent-flow",
        routerName: "symphony-intelligent-flow",
        routerVersion: "1",
        createdAt: "2026-04-13T06:06:00.000Z"
      });

      const contract = await routeStore.saveExecutionContract({
        workflowId,
        contract: createSymphonyTicketExecutionContract({
          contractId: "contract_workflow_313",
          workflowId,
          issueIdentifier: "SYM-313",
          repositoryKey: "openai/symphony",
          summary: "Persist the first capability planner decision.",
          objective: "Compute and persist the first deterministic capability plan.",
          doneDefinition: "A planner decision and capability command are stored together.",
          routingDirectives: {
            requiredCapabilityIds: ["implement.spec", "critic.code_review"],
            preferredCapabilityIds: [],
            forbiddenCapabilityIds: ["critic.browser_test"],
            requiredEvidenceIds: ["change_set", "code_review_report"],
            allowedModelProfileIds: [
              "builder_fast",
              "builder_deep",
              "critic_strict",
              "critic_adversarial"
            ],
            clarificationPolicy: {
              mode: "required"
            },
            reviewStrictness: "strict",
            maxRetryCount: 2
          },
          createdAt: "2026-04-13T06:07:00.000Z",
          updatedAt: "2026-04-13T06:07:00.000Z"
        }),
        recordedAt: "2026-04-13T06:07:00.000Z"
      });

      const command = createSymphonyCapabilityExecutionCommand({
        id: "command_capability_execute_313",
        dedupeKey: "workflow-313:implement.spec:1",
        workflowId,
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        contract: {
          contractId: contract.contractId,
          workflowId: contract.workflowId,
          issueIdentifier: contract.issueIdentifier,
          repositoryKey: contract.repositoryKey,
          summary: contract.summary,
          objective: contract.objective,
          doneDefinition: contract.doneDefinition,
          routingDirectives: {
            requiredCapabilityIds: [...contract.routingDirectives.requiredCapabilityIds],
            preferredCapabilityIds: [...contract.routingDirectives.preferredCapabilityIds],
            forbiddenCapabilityIds: [...contract.routingDirectives.forbiddenCapabilityIds],
            requiredEvidenceIds: [...contract.routingDirectives.requiredEvidenceIds],
            allowedModelProfileIds: [...contract.routingDirectives.allowedModelProfileIds],
            clarificationPolicy: {
              mode: contract.routingDirectives.clarificationPolicy.mode
            },
            reviewStrictness: contract.routingDirectives.reviewStrictness,
            maxRetryCount: contract.routingDirectives.maxRetryCount
          },
          createdAt: contract.createdAt,
          updatedAt: contract.updatedAt
        },
        executionInput: null
      });
      const saved = await routeStore.saveCapabilityPlannerDecision({
        workflowId,
        decisionId: "capability_plan_decision_313",
        policyId: "default",
        contract,
        historyEventSequence: 0,
        lifecycleProjectionSequence: 0,
        lifecycleCurrentNode: null,
        plan: {
          kind: "execute",
          candidate: {
            capabilityId: "implement.spec",
            phase: "implementing",
            workEpoch: 1,
            priority: 100,
            required: true,
            preferred: false,
            allowedModelProfileIds: ["builder_fast", "builder_deep"],
            reason: "Implementation is the first required capability."
          },
          decision: {
            decisionId: "capability_plan_decision_313",
            capabilityId: "implement.spec",
            modelProfileId: "builder_fast",
            workEpoch: 1,
            rationale: "Implementation is the first required capability.",
            decidedAt: "2026-04-13T06:08:00.000Z"
          }
        },
        command,
        recordedAt: "2026-04-13T06:08:00.000Z"
      });

      const loadedDecision = await routeStore.getCapabilityPlannerDecisionForState({
        workflowId,
        historyEventSequence: 0,
        contractUpdatedAt: contract.updatedAt,
        policyId: "default"
      });
      const loadedCommand = await routeStore.getCapabilityPlannerCommandByDecisionId(
        saved.decision.decisionId
      );
      const allCommands = await routeStore.listCapabilityPlannerCommands(workflowId);

      expect(saved.decision).toEqual({
        decisionId: "capability_plan_decision_313",
        workflowId,
        contractId: "contract_workflow_313",
        contractUpdatedAt: "2026-04-13T06:07:00.000Z",
        policyId: "default",
        historyEventSequence: 0,
        lifecycleProjectionSequence: 0,
        lifecycleCurrentNode: null,
        planKind: "execute",
        plan: {
          kind: "execute",
          candidate: {
            capabilityId: "implement.spec",
            phase: "implementing",
            workEpoch: 1,
            priority: 100,
            required: true,
            preferred: false,
            allowedModelProfileIds: ["builder_fast", "builder_deep"],
            reason: "Implementation is the first required capability."
          },
          decision: {
            decisionId: "capability_plan_decision_313",
            capabilityId: "implement.spec",
            modelProfileId: "builder_fast",
            workEpoch: 1,
            rationale: "Implementation is the first required capability.",
            decidedAt: "2026-04-13T06:08:00.000Z"
          }
        },
        intelligentFlowRouterDecision: null,
        recordedAt: "2026-04-13T06:08:00.000Z",
        insertedAt: "2026-04-13T06:08:00.000Z"
      });
      expect(saved.command).toEqual({
        commandId: "command_capability_execute_313",
        workflowId,
        decisionId: "capability_plan_decision_313",
        contractId: "contract_workflow_313",
        historyEventSequence: 0,
        dedupeKey: "workflow-313:implement.spec:1",
        kind: "capability.execute",
        command,
        emittedAt: "2026-04-13T06:08:00.000Z",
        insertedAt: "2026-04-13T06:08:00.000Z"
      });
      expect(loadedDecision).toEqual(saved.decision);
      expect(loadedCommand).toEqual(saved.command);
      expect(allCommands).toEqual([saved.command]);
      expect(await routeStore.listHistory(workflowId)).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("keeps planner decisions isolated by policy id for the same workflow state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-route-capability-plan-policy-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-313B",
        trackerIssueId: "tracker-313B",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-13T06:09:00.000Z"
      });

      const workflowId = await routeStore.createWorkflow({
        trackerIssueId: "tracker-313B",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-313B",
        routerPresetId: "intelligent-flow",
        routerName: "symphony-intelligent-flow",
        routerVersion: "1",
        createdAt: "2026-04-13T06:10:00.000Z"
      });

      const contract = await routeStore.saveExecutionContract({
        workflowId,
        contract: createSymphonyTicketExecutionContract({
          contractId: "contract_workflow_313B",
          workflowId,
          issueIdentifier: "SYM-313B",
          repositoryKey: "openai/symphony",
          summary: "Persist policy-qualified planner decisions.",
          objective: "Allow multiple planner decisions for one workflow state when policies differ.",
          doneDefinition: "Each policy lookup resolves its own planner decision.",
          routingDirectives: {
            requiredCapabilityIds: ["implement.spec", "critic.code_review"],
            preferredCapabilityIds: [],
            forbiddenCapabilityIds: ["critic.browser_test"],
            requiredEvidenceIds: ["change_set", "code_review_report"],
            allowedModelProfileIds: [
              "builder_fast",
              "builder_deep",
              "critic_strict",
              "critic_adversarial"
            ],
            clarificationPolicy: {
              mode: "required"
            },
            reviewStrictness: "strict",
            maxRetryCount: 2
          },
          createdAt: "2026-04-13T06:11:00.000Z",
          updatedAt: "2026-04-13T06:11:00.000Z"
        }),
        recordedAt: "2026-04-13T06:11:00.000Z"
      });

      const defaultDecision = await routeStore.saveCapabilityPlannerDecision({
        workflowId,
        decisionId: "capability_plan_decision_313B_default",
        policyId: "default",
        contract,
        historyEventSequence: 0,
        lifecycleProjectionSequence: 0,
        lifecycleCurrentNode: null,
        plan: {
          kind: "ready_for_completion",
          evaluation: {
            workEpoch: 1,
            result: "ready_for_completion",
            satisfiedCapabilityIds: ["implement.spec", "critic.code_review"],
            missingCapabilityIds: [],
            satisfiedEvidenceIds: ["change_set", "code_review_report"],
            missingEvidenceIds: [],
            reasons: ["All required evidence is present."]
          }
        },
        recordedAt: "2026-04-13T06:12:00.000Z"
      });
      const strictDecision = await routeStore.saveCapabilityPlannerDecision({
        workflowId,
        decisionId: "capability_plan_decision_313B_backend",
        policyId: "backend_strict",
        contract,
        historyEventSequence: 0,
        lifecycleProjectionSequence: 0,
        lifecycleCurrentNode: null,
        plan: {
          kind: "blocked",
          reason: "Await adversarial verification."
        },
        recordedAt: "2026-04-13T06:13:00.000Z"
      });

      const loadedDefault = await routeStore.getCapabilityPlannerDecisionForState({
        workflowId,
        historyEventSequence: 0,
        contractUpdatedAt: contract.updatedAt,
        policyId: "default"
      });
      const loadedStrict = await routeStore.getCapabilityPlannerDecisionForState({
        workflowId,
        historyEventSequence: 0,
        contractUpdatedAt: contract.updatedAt,
        policyId: "backend_strict"
      });

      expect(defaultDecision.command).toBeNull();
      expect(strictDecision.command).toBeNull();
      expect(loadedDefault).toEqual(defaultDecision.decision);
      expect(loadedStrict).toEqual(strictDecision.decision);
      expect(loadedDefault?.intelligentFlowRouterDecision).toBeNull();
      expect(loadedStrict?.intelligentFlowRouterDecision).toBeNull();
      expect(loadedDefault?.decisionId).not.toBe(loadedStrict?.decisionId);
    } finally {
      database.close();
    }
  });

  it("persists intelligent-flow router decisions with candidate sets for replay", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "symphony-route-capability-plan-intelligent-flow-")
    );
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const routeStore = createRouteWorkflowStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-313C",
        trackerIssueId: "tracker-313C",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-13T06:14:00.000Z"
      });

      const workflowId = await routeStore.createWorkflow({
        trackerIssueId: "tracker-313C",
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-313C",
        routerPresetId: "intelligent-flow",
        routerName: "symphony-intelligent-flow",
        routerVersion: "1",
        createdAt: "2026-04-13T06:15:00.000Z"
      });

      const contract = await routeStore.saveExecutionContract({
        workflowId,
        contract: createSymphonyTicketExecutionContract({
          contractId: "contract_workflow_313C",
          workflowId,
          issueIdentifier: "SYM-313C",
          repositoryKey: "openai/symphony",
          summary: "Persist intelligent-flow planner decisions.",
          objective: "Store the admissible candidate set with the selected module.",
          doneDefinition: "The intelligent-flow router decision is replayable after restart.",
          routingDirectives: {
            requiredCapabilityIds: ["implement.spec", "critic.code_review"],
            preferredCapabilityIds: [],
            forbiddenCapabilityIds: ["critic.browser_test"],
            requiredEvidenceIds: ["change_set", "code_review_report"],
            allowedModelProfileIds: [
              "builder_fast",
              "builder_deep",
              "critic_strict",
              "critic_adversarial"
            ],
            clarificationPolicy: {
              mode: "required"
            },
            reviewStrictness: "strict",
            maxRetryCount: 2
          },
          createdAt: "2026-04-13T06:16:00.000Z",
          updatedAt: "2026-04-13T06:16:00.000Z"
        }),
        recordedAt: "2026-04-13T06:16:00.000Z"
      });

      const command = createSymphonyCapabilityExecutionCommand({
        id: "command_capability_execute_313C",
        dedupeKey: "workflow-313C:implement.spec:1",
        workflowId,
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        contract: {
          contractId: contract.contractId,
          workflowId: contract.workflowId,
          issueIdentifier: contract.issueIdentifier,
          repositoryKey: contract.repositoryKey,
          summary: contract.summary,
          objective: contract.objective,
          doneDefinition: contract.doneDefinition,
          routingDirectives: {
            requiredCapabilityIds: [...contract.routingDirectives.requiredCapabilityIds],
            preferredCapabilityIds: [...contract.routingDirectives.preferredCapabilityIds],
            forbiddenCapabilityIds: [...contract.routingDirectives.forbiddenCapabilityIds],
            requiredEvidenceIds: [...contract.routingDirectives.requiredEvidenceIds],
            allowedModelProfileIds: [...contract.routingDirectives.allowedModelProfileIds],
            clarificationPolicy: {
              mode: contract.routingDirectives.clarificationPolicy.mode
            },
            reviewStrictness: contract.routingDirectives.reviewStrictness,
            maxRetryCount: contract.routingDirectives.maxRetryCount
          },
          createdAt: contract.createdAt,
          updatedAt: contract.updatedAt
        },
        executionInput: null
      });
      const intelligentFlowRouterDecision = createSymphonyIntelligentFlowRouterDecision({
        decisionId: "capability_plan_decision_313C",
        workflowId,
        policyId: "default",
        recordedAt: "2026-04-13T06:17:00.000Z",
        candidateSet: {
          admissible: [
            {
              moduleId: "implement.spec",
              rank: 0,
              reasonCode: "required_by_contract",
              summary: "implement.spec must produce the initial change set for work epoch 1."
            },
            {
              moduleId: "critic.code_review",
              rank: 1,
              reasonCode: "verification_follow_up",
              summary: "critic.code_review follows implementation evidence."
            }
          ],
          rejected: [
            {
              moduleId: "critic.browser_test",
              reasonCode: "disabled_by_default",
              summary: "critic.browser_test is disabled by default."
            }
          ]
        },
        selectedModuleId: "implement.spec",
        selectionMode: "deterministic",
        selectionSummary:
          "implement.spec must produce the initial change set for work epoch 1.",
        selectionRationale:
          'Selected intelligent-flow module "implement.spec" at admissibility rank 0 with model profile "builder_fast". implement.spec must produce the initial change set for work epoch 1.',
        confidence: null,
        inputProjectionFingerprint:
          'workflow="workflow-313C"|lifecycle="active"|phase="implementing"',
        fallbackReason: null
      });
      const saved = await routeStore.saveCapabilityPlannerDecision({
        workflowId,
        decisionId: "capability_plan_decision_313C",
        policyId: "default",
        contract,
        historyEventSequence: 0,
        lifecycleProjectionSequence: 0,
        lifecycleCurrentNode: "active",
        plan: {
          kind: "execute",
          candidate: {
            capabilityId: "implement.spec",
            phase: "implementing",
            workEpoch: 1,
            priority: 2,
            required: true,
            preferred: false,
            allowedModelProfileIds: ["builder_fast", "builder_deep"],
            reason: "implement.spec must produce the initial change set for work epoch 1."
          },
          decision: {
            decisionId: "capability_plan_decision_313C",
            capabilityId: "implement.spec",
            modelProfileId: "builder_fast",
            workEpoch: 1,
            rationale:
              'Selected intelligent-flow module "implement.spec" at admissibility rank 0 with model profile "builder_fast". implement.spec must produce the initial change set for work epoch 1.',
            decidedAt: "2026-04-13T06:17:00.000Z"
          }
        },
        intelligentFlowRouterDecision,
        command,
        recordedAt: "2026-04-13T06:17:00.000Z"
      });

      const loaded = await routeStore.getCapabilityPlannerDecisionForState({
        workflowId,
        historyEventSequence: 0,
        contractUpdatedAt: contract.updatedAt,
        policyId: "default"
      });

      expect(saved.decision.intelligentFlowRouterDecision).toEqual(
        intelligentFlowRouterDecision
      );
      expect(loaded?.intelligentFlowRouterDecision).toEqual(
        intelligentFlowRouterDecision
      );
      expect(loaded).toEqual(saved.decision);
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
        routerPresetId: "intelligent-flow",
        routerName: "symphony-intelligent-flow",
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
        routerPresetId: "intelligent-flow",
        routerName: "symphony-intelligent-flow",
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
        routerPresetId: "intelligent-flow",
        routerName: "symphony-intelligent-flow",
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
        routerPresetId: "intelligent-flow",
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
