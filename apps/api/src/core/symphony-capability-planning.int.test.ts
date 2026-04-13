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
  createSymphonyCurrentFlowRouterAsync,
  createSymphonyCurrentFlowTrackerStateObservedSignal
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
          contractUpdatedAt: seeded.contract.updatedAt
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
        recordedAt: "2026-04-13T07:05:00.000Z"
      });
      harness.close();

      const reopened = await openHarness(harness.root);
      try {
        const second = await reopened.planning.planByWorkflowId({
          workflowId: seeded.workflowId,
          recordedAt: "2026-04-13T07:06:00.000Z"
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
  harness: Awaited<ReturnType<typeof openHarness>>
) {
  const issue = buildIssue();
  const router = await createSymphonyCurrentFlowRouterAsync();

  await harness.issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony",
    latestRunStartedAt: null,
    recordedAt: "2026-04-13T07:00:00.000Z"
  });

  const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
    trackerIssueId: issue.id,
    issueIdentifier: issue.identifier,
    repositoryKey: "openai/symphony",
    routerPresetId: "current-flow",
    router,
    createdAt: "2026-04-13T07:00:30.000Z"
  });
  const workflowId = ensured.workflow.workflowId;
  const session = await router.startSessionAsync({
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
      correlationId: issue.identifier
    })
  );
  await harness.routeWorkflows.recordRouteResult({
    workflowId,
    policy: {},
    result: bootstrapResult
  });

  const contract = await harness.intake.createAndPersistForWorkflow({
    workflowId,
    issue,
    repositoryKey: "openai/symphony",
    recordedAt: "2026-04-13T07:02:00.000Z"
  });

  return {
    workflowId,
    issue,
    contract
  };
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
