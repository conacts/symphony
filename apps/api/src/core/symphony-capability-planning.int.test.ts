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
  createSymphonyCapabilityCompletedSignal,
  createSymphonyCapabilityStartedSignal,
  createSymphonyCurrentFlowRouterAsync,
  createSymphonyIntelligentFlowRouterAsync,
  createSymphonyCurrentFlowTrackerStateObservedSignal,
  type WorkflowRouter,
  type WorkflowNodeId
} from "@symphony/router";
import {
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
  createSymphonyCapabilityContractIntake
} from "./symphony-capability-contract-intake.js";
import {
  createSymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";

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

describe("Symphony capability planning", () => {
  it("plans the next deterministic capability step from persisted workflow state", async () => {
    const harness = await createHarness();
    const seeded = await seedPlannerFixture(harness);

    try {
      const result = await harness.planning.planByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T07:03:00.000Z"
      });
      const history = await harness.routeWorkflowStore.listHistory(seeded.workflowId);
      const hydration = await harness.routeWorkflowStore.loadWorkflowHydrationState(
        seeded.workflowId
      );

      expect(result.reused).toBe(false);
      expect(result.plan).toEqual({
        kind: "execute",
        candidate: expect.objectContaining({
          capabilityId: "implement.spec",
          workEpoch: 1
        }),
        decision: expect.objectContaining({
          decisionId: result.decision.decisionId,
          capabilityId: "implement.spec",
          modelProfileId: "builder_fast",
          workEpoch: 1
        })
      });
      expect(result.decision).toEqual(
        expect.objectContaining({
          workflowId: seeded.workflowId,
          contractId: seeded.contract.contractId,
          contractUpdatedAt: seeded.contract.updatedAt,
          policyId: "default",
          historyEventSequence: history.at(-1)?.eventSequence ?? 0,
          lifecycleProjectionSequence: hydration?.snapshot?.projection.sequence ?? 0,
          lifecycleCurrentNode: hydration?.snapshot?.projection.currentNode ?? null,
          planKind: "execute"
        })
      );
      expect(result.command).toEqual(
        expect.objectContaining({
          workflowId: seeded.workflowId,
          decisionId: result.decision.decisionId,
          kind: "capability.execute",
          command: expect.objectContaining({
            kind: "capability.execute",
            payload: expect.objectContaining({
              workflowId: seeded.workflowId,
              capabilityId: "implement.spec",
              modelProfileId: "builder_fast",
              contract: expect.objectContaining({
                contractId: seeded.contract.contractId
              })
            })
          })
        })
      );
    } finally {
      harness.close();
    }
  });

  it("records the planner decision and emitted capability command", async () => {
    const harness = await createHarness();
    const seeded = await seedPlannerFixture(harness);

    try {
      const result = await harness.planning.planByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T07:04:00.000Z"
      });
      const history = await harness.routeWorkflowStore.listHistory(seeded.workflowId);
      const persistedDecision =
        await harness.routeWorkflowStore.getCapabilityPlannerDecisionForState({
          workflowId: seeded.workflowId,
          historyEventSequence: history.at(-1)?.eventSequence ?? 0,
          contractUpdatedAt: seeded.contract.updatedAt,
          policyId: "default"
        });
      const persistedCommand =
        await harness.routeWorkflowStore.getCapabilityPlannerCommandByDecisionId(
          result.decision.decisionId
        );
      const allCommands = await harness.routeWorkflowStore.listCapabilityPlannerCommands(
        seeded.workflowId
      );

      expect(persistedDecision).toEqual(result.decision);
      expect(persistedCommand).toEqual(result.command);
      expect(allCommands).toHaveLength(1);
      expect(allCommands[0]).toEqual(result.command);
    } finally {
      harness.close();
    }
  });

  it("reuses the persisted planner decision after restart for the same workflow state", async () => {
    const harness = await createHarness();
    const seeded = await seedPlannerFixture(harness);

    try {
      const first = await harness.planning.planByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T07:05:00.000Z",
        policyId: "default"
      });
      harness.close();

      const reopened = await openHarness(harness.root);
      try {
        const second = await reopened.planning.planByWorkflowId({
          workflowId: seeded.workflowId,
          recordedAt: "2026-04-13T07:06:00.000Z",
          policyId: "default"
        });
        const commands = await reopened.routeWorkflowStore.listCapabilityPlannerCommands(
          seeded.workflowId
        );

        expect(second.reused).toBe(true);
        expect(second.plan).toEqual(first.plan);
        expect(second.decision).toEqual(first.decision);
        expect(second.command).toEqual(first.command);
        expect(commands).toHaveLength(1);
      } finally {
        reopened.close();
      }
    } catch (error) {
      harness.close();
      throw error;
    }
  });

  it("does not reuse persisted planner decisions across policy ids for the same workflow state", async () => {
    const harness = await createHarness();
    const seeded = await seedPlannerFixture(harness);

    try {
      await recordCapabilityCompletion({
        harness,
        workflowId: seeded.workflowId,
        issueIdentifier: seeded.contract.issueIdentifier,
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        evidenceId: "change_set",
        executionId: "exec_impl_1",
        workEpoch: 1,
        attempt: 1,
        recordedAt: "2026-04-13T07:07:00.000Z"
      });
      await recordCapabilityCompletion({
        harness,
        workflowId: seeded.workflowId,
        issueIdentifier: seeded.contract.issueIdentifier,
        capabilityId: "critic.code_review",
        modelProfileId: "critic_strict",
        evidenceId: "code_review_report",
        executionId: "exec_review_1",
        workEpoch: 1,
        attempt: 1,
        recordedAt: "2026-04-13T07:08:00.000Z"
      });

      const history = await harness.routeWorkflowStore.listHistory(seeded.workflowId);
      const historyEventSequence = history.at(-1)?.eventSequence ?? 0;
      const defaultPlan = await harness.planning.planByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T07:09:00.000Z",
        policyId: "default"
      });
      const strictPlan = await harness.planning.planByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T07:10:00.000Z",
        policyId: "backend_strict"
      });
      const persistedDefault =
        await harness.routeWorkflowStore.getCapabilityPlannerDecisionForState({
          workflowId: seeded.workflowId,
          historyEventSequence,
          contractUpdatedAt: seeded.contract.updatedAt,
          policyId: "default"
        });
      const persistedStrict =
        await harness.routeWorkflowStore.getCapabilityPlannerDecisionForState({
          workflowId: seeded.workflowId,
          historyEventSequence,
          contractUpdatedAt: seeded.contract.updatedAt,
          policyId: "backend_strict"
        });

      expect(defaultPlan.reused).toBe(false);
      expect(defaultPlan.plan.kind).toBe("ready_for_manual_completion");
      expect(defaultPlan.command).toBeNull();
      expect(defaultPlan.decision.policyId).toBe("default");

      expect(strictPlan.reused).toBe(false);
      expect(strictPlan.plan).toEqual(
        expect.objectContaining({
          kind: "execute",
          decision: expect.objectContaining({
            capabilityId: "critic.adversarial_tests",
            workEpoch: 1
          })
        })
      );
      expect(strictPlan.decision.policyId).toBe("backend_strict");
      expect(strictPlan.command?.command.dedupeKey).toContain(":backend_strict:");
      expect(persistedDefault?.decisionId).toBe(defaultPlan.decision.decisionId);
      expect(persistedStrict?.decisionId).toBe(strictPlan.decision.decisionId);
      expect(persistedDefault?.decisionId).not.toBe(persistedStrict?.decisionId);
    } finally {
      harness.close();
    }
  });

  it("uses intelligent-flow admissibility to select implement.spec first", async () => {
    const harness = await createHarness();
    const seeded = await seedPlannerFixture(harness, {
      presetId: "intelligent-flow"
    });

    try {
      const result = await harness.planning.planByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T07:11:00.000Z"
      });

      expect(result.plan).toEqual({
        kind: "execute",
        candidate: expect.objectContaining({
          capabilityId: "implement.spec",
          phase: "implementing",
          workEpoch: 1
        }),
        decision: expect.objectContaining({
          capabilityId: "implement.spec",
          modelProfileId: "builder_fast",
          workEpoch: 1
        })
      });
      expect(result.command?.command.payload.capabilityId).toBe("implement.spec");
    } finally {
      harness.close();
    }
  });

  it("uses intelligent-flow admissibility to select critic.code_review after implementation", async () => {
    const harness = await createHarness();
    const seeded = await seedPlannerFixture(harness, {
      presetId: "intelligent-flow"
    });

    try {
      await recordCapabilityCompletion({
        harness,
        workflowId: seeded.workflowId,
        issueIdentifier: seeded.contract.issueIdentifier,
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        evidenceId: "change_set",
        executionId: "exec_impl_1",
        workEpoch: 1,
        attempt: 1,
        recordedAt: "2026-04-13T07:12:00.000Z"
      });

      const result = await harness.planning.planByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T07:13:00.000Z"
      });

      expect(result.plan).toEqual({
        kind: "execute",
        candidate: expect.objectContaining({
          capabilityId: "critic.code_review",
          phase: "verifying",
          workEpoch: 1
        }),
        decision: expect.objectContaining({
          capabilityId: "critic.code_review",
          modelProfileId: "critic_strict",
          workEpoch: 1
        })
      });
      expect(result.command?.command.payload.capabilityId).toBe("critic.code_review");
    } finally {
      harness.close();
    }
  });
});

async function createHarness() {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-capability-planning-"));
  tempDirectories.push(root);
  return await openHarness(root);
}

async function openHarness(root: string) {
  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const routeWorkflowStore = createRouteWorkflowStore(database.db);
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore
  });

  return {
    root,
    database,
    issueStore: createSymphonyIssueStore(database.db),
    routeWorkflowStore,
    routeWorkflows,
    intake: createSymphonyCapabilityContractIntake({
      routeWorkflows
    }),
    planning: createSymphonyCapabilityPlanningService({
      routeWorkflowStore
    }),
    close() {
      database.close();
    }
  };
}

async function seedPlannerFixture(
  harness: Awaited<ReturnType<typeof openHarness>>,
  input: {
    presetId?: "current-flow" | "intelligent-flow";
  } = {}
) {
  const issue = buildIssue();
  const presetId = input.presetId ?? "current-flow";

  await harness.issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony",
    latestRunStartedAt: null,
    recordedAt: "2026-04-13T07:00:00.000Z"
  });

  if (presetId === "intelligent-flow") {
    const router = await createSymphonyIntelligentFlowRouterAsync();

    return await seedPlannerFixtureWithRouter({
      harness,
      issue,
      routerPresetId: presetId,
      router
    });
  }

  const router = await createSymphonyCurrentFlowRouterAsync();

  return await seedPlannerFixtureWithRouter({
    harness,
    issue,
    routerPresetId: presetId,
    router
  });
}

async function seedPlannerFixtureWithRouter<
  Node extends WorkflowNodeId,
  Data,
>(input: {
  harness: Awaited<ReturnType<typeof openHarness>>;
  issue: ReturnType<typeof buildIssue>;
  routerPresetId: "current-flow" | "intelligent-flow";
  router: WorkflowRouter<Node, Data, Record<string, never>>;
}) {
  const ensured = await input.harness.routeWorkflows.ensureWorkflowForIssue({
    trackerIssueId: input.issue.id,
    issueIdentifier: input.issue.identifier,
    repositoryKey: "openai/symphony",
    routerPresetId: input.routerPresetId,
    router: input.router,
    createdAt: "2026-04-13T07:00:30.000Z"
  });
  const workflowId = ensured.workflow.workflowId;
  const session = await input.router.startSessionAsync({
    workflowId,
    policy: {}
  });
  const bootstrapResult = await session.receiveAsync(
    createSymphonyCurrentFlowTrackerStateObservedSignal({
      id: "signal_todo_observed_planner",
      occurredAt: "2026-04-13T07:01:00.000Z",
      state: "Todo",
      runId: null,
      runMode: null,
      causationId: null,
      correlationId: input.issue.identifier
    })
  );
  await input.harness.routeWorkflows.recordRouteResult({
    workflowId,
    policy: {},
    result: bootstrapResult
  });

  const contract = await input.harness.intake.createAndPersistForWorkflow({
    workflowId,
    issue: input.issue,
    repositoryKey: "openai/symphony",
    recordedAt: "2026-04-13T07:02:00.000Z"
  });

  return {
    workflowId,
    issue: input.issue,
    contract
  };
}

async function recordCapabilityCompletion(input: {
  harness: Awaited<ReturnType<typeof openHarness>>;
  workflowId: string;
  issueIdentifier: string;
  capabilityId: "implement.spec" | "critic.code_review";
  modelProfileId: "builder_fast" | "critic_strict";
  evidenceId: "change_set" | "code_review_report";
  executionId: string;
  workEpoch: number;
  attempt: number;
  recordedAt: string;
}) {
  await input.harness.routeWorkflowStore.appendHistoryEvent({
    workflowId: input.workflowId,
    event: {
      kind: "signal_recorded",
      recordedAt: input.recordedAt,
      signal: createSymphonyCapabilityStartedSignal({
        id: `signal_started_${input.executionId}`,
        occurredAt: input.recordedAt,
        source: "runtime",
        workflowId: input.workflowId,
        executionId: input.executionId,
        capabilityId: input.capabilityId,
        modelProfileId: input.modelProfileId,
        workEpoch: input.workEpoch,
        attempt: input.attempt,
        summary: `Started ${input.capabilityId}.`,
        causationId: null,
        correlationId: input.issueIdentifier
      })
    }
  });
  await input.harness.routeWorkflowStore.appendHistoryEvent({
    workflowId: input.workflowId,
    event: {
      kind: "signal_recorded",
      recordedAt: incrementIsoTimestamp(input.recordedAt, 1),
      signal: createSymphonyCapabilityCompletedSignal({
        id: `signal_completed_${input.executionId}`,
        occurredAt: incrementIsoTimestamp(input.recordedAt, 1),
        source: "runtime",
        workflowId: input.workflowId,
        executionId: input.executionId,
        capabilityId: input.capabilityId,
        modelProfileId: input.modelProfileId,
        workEpoch: input.workEpoch,
        attempt: input.attempt,
        summary: `Completed ${input.capabilityId}.`,
        evidenceProduced: [
          {
            evidenceId: input.evidenceId,
            summary: `Produced ${input.evidenceId}.`,
            artifacts: []
          }
        ],
        causationId: null,
        correlationId: input.issueIdentifier
      })
    }
  });
}

function incrementIsoTimestamp(value: string, seconds: number): string {
  return new Date(Date.parse(value) + seconds * 1000).toISOString();
}

function buildIssue() {
  return buildSymphonyTrackerIssue({
    id: "issue-capability-plan-123",
    identifier: "SYM-CAP-PLAN-123",
    title: "Plan the first capability execution step",
    description: createDescription()
  });
}

function createDescription() {
  return [
    "## Objective",
    "Compute the first capability plan from persisted workflow state.",
    "",
    "## Done Definition",
    "The planner persists one deterministic decision and emitted capability command.",
    "",
    "## Merge Policy",
    "manual"
  ].join("\n");
}
