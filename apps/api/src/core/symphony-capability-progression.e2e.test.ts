import { afterEach, describe, expect, it } from "vitest";
import {
  createSymphonyCapabilityPreset,
  createSymphonyTicketExecutionContract,
  type SymphonyCapabilityPresetPolicyId,
  type SymphonyCapabilityModelProfileId,
  type SymphonyIntelligentFlowData,
  type SymphonyIntelligentFlowNode,
  type SymphonyIntelligentFlowPolicy,
  type SymphonyWorkflowCapabilityPreset
} from "@symphony/router";
import type { SymphonyAgentRuntimeCompletion } from "@symphony/orchestrator";
import type { SymphonyImplementationModuleResult } from "@symphony/runtime-contract";
import { createSymphonyCapabilityContractIntake } from "./symphony-capability-contract-intake.js";
import {
  advanceWorkflowToRunningImplementation,
  createRouteLifecycleGoldenPathHarness,
  listRecordedWorkflowSignalTypes,
  loadRequiredWorkflowId,
  type RouteLifecycleGoldenPathHarness
} from "../test-support/runtime-route-lifecycle-golden-path-harness.js";

let harness: RouteLifecycleGoldenPathHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("capability progression golden paths", () => {
  it("continues capability-managed implementation into code review without requiring finish", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo"
    });
    await advanceWorkflowToRunningImplementation(harness);

    const workflowId = await loadRequiredWorkflowId(harness);
    const intake = createSymphonyCapabilityContractIntake({
      routeWorkflows: harness.routeWorkflows
    });
    await intake.createAndPersistForWorkflow({
      workflowId,
      issue: harness.issue,
      repositoryKey: "openai/symphony",
      recordedAt: "2026-04-13T10:00:29.000Z"
    });

    const inProgressIssue = harness.tracker.getIssue(harness.issue.id);
    if (!inProgressIssue) {
      throw new TypeError(
        `Expected in-progress issue state for ${harness.issue.identifier}.`
      );
    }

    const routed = await harness.service.workflowRoutingAdapter.routeRunCompletion({
      issue: inProgressIssue,
      runId: "run-1",
      runMode: "implementation",
      completion: {
        kind: "delivered"
      },
      recordedAt: "2026-04-13T10:00:30.000Z"
    });

    expect(routed).toEqual({
      issue: expect.objectContaining({
        id: harness.issue.id,
        state: "In Progress"
      }),
      continueWithRunMode: "implementation"
    });
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Progress");

    const nextPlanning = await harness.capabilityPlanning.planByWorkflowId({
      workflowId,
      recordedAt: "2026-04-13T10:00:32.000Z"
    });
    expect(nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "critic.code_review",
          workEpoch: 1
        })
      })
    );

    const workflowLifecycle = await harness.service.loadWorkflowLifecycleView({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1"
    });
    expect(workflowLifecycle).not.toBeNull();
    expect(workflowLifecycle?.trackerState).toBe("In Progress");

    const hydration =
      await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyIntelligentFlowNode,
        SymphonyIntelligentFlowData,
        SymphonyIntelligentFlowPolicy
      >(harness.issue.identifier);
    expect(hydration?.snapshot?.projection.currentNode).toBe("active");

    const signalTypes = await listRecordedWorkflowSignalTypes(harness, workflowId);
    expect(signalTypes).toEqual(
      expect.arrayContaining(["capability.started", "capability.completed"])
    );
    expect(signalTypes).not.toContain("runtime.completed");
  });

  it("closes implementation-only capability-managed completion directly into Done instead of pausing", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo",
      createIntelligentFlowCapabilityPreset: createNeutralCapabilityPresetFactory()
    });
    await advanceWorkflowToRunningImplementation(harness);

    const workflowId = await loadRequiredWorkflowId(harness);
    await persistImplementationOnlyContract(harness, workflowId, "2026-04-13T10:10:29.000Z");

    const inProgressIssue = requireInProgressIssue(harness);
    const routed = await harness.service.workflowRoutingAdapter.routeRunCompletion({
      issue: inProgressIssue,
      runId: "run-1",
      runMode: "implementation",
      completion: buildDeliveredImplementationCompletion(),
      recordedAt: "2026-04-13T10:10:30.000Z"
    });

    expect(routed).toEqual({
      issue: expect.objectContaining({
        id: harness.issue.id,
        state: "Done"
      }),
      continueWithRunMode: null
    });
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");

    const workflowLifecycle = await harness.service.loadWorkflowLifecycleView({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1"
    });
    expect(workflowLifecycle).not.toBeNull();
    expect(workflowLifecycle?.trackerState).toBe("Done");

    const hydration =
      await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyIntelligentFlowNode,
        SymphonyIntelligentFlowData,
        SymphonyIntelligentFlowPolicy
      >(harness.issue.identifier);
    expect(hydration?.snapshot?.projection.currentNode).toBe("done");

    const signalTypes = await listRecordedWorkflowSignalTypes(harness, workflowId);
    expect(signalTypes).toEqual(
      expect.arrayContaining([
        "capability.started",
        "capability.completed",
        "runtime.completed"
      ])
    );
    expect(signalTypes).not.toContain("runtime.shutdown_requested");
  });

  it("moves capability-managed clarification into awaiting_input without pausing the tracker shell", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo"
    });
    await advanceWorkflowToRunningImplementation(harness);

    const workflowId = await loadRequiredWorkflowId(harness);
    await persistImplementationOnlyContract(harness, workflowId, "2026-04-13T10:20:29.000Z");

    const inProgressIssue = requireInProgressIssue(harness);
    const routed = await harness.service.workflowRoutingAdapter.routeRunCompletion({
      issue: inProgressIssue,
      runId: "run-1",
      runMode: "implementation",
      completion: buildAwaitingInputImplementationCompletion(),
      recordedAt: "2026-04-13T10:20:30.000Z"
    });

    expect(routed).toEqual({
      issue: expect.objectContaining({
        id: harness.issue.id,
        state: "In Progress"
      })
    });
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Progress");

    const nextPlanning = await harness.capabilityPlanning.planByWorkflowId({
      workflowId,
      recordedAt: "2026-04-13T10:20:32.000Z"
    });
    expect(nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "awaiting_input",
        clarification: expect.objectContaining({
          raisedByCapabilityId: "implement.spec",
          workEpoch: 1
        })
      })
    );

    const workflowLifecycle = await harness.service.loadWorkflowLifecycleView({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1"
    });
    expect(workflowLifecycle).not.toBeNull();
    expect(workflowLifecycle?.trackerState).toBe("In Progress");

    const hydration =
      await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyIntelligentFlowNode,
        SymphonyIntelligentFlowData,
        SymphonyIntelligentFlowPolicy
      >(harness.issue.identifier);
    expect(hydration?.snapshot?.projection.currentNode).toBe("awaiting_input");

    const signalTypes = await listRecordedWorkflowSignalTypes(harness, workflowId);
    expect(signalTypes).toEqual(
      expect.arrayContaining([
        "capability.started",
        "workflow.clarification_requested"
      ])
    );
    expect(signalTypes).not.toContain("runtime.completed");
  });
});

async function persistImplementationOnlyContract(
  harness: RouteLifecycleGoldenPathHarness,
  workflowId: string,
  recordedAt: string
) {
  await harness.routeWorkflows.saveExecutionContract({
    workflowId,
    contract: buildImplementationOnlyContract({
      workflowId,
      issueIdentifier: harness.issue.identifier,
      repositoryKey: "openai/symphony",
      summary: harness.issue.title,
      recordedAt
    }),
    recordedAt
  });
}

function buildImplementationOnlyContract(input: {
  workflowId: string;
  issueIdentifier: string;
  repositoryKey: string;
  summary: string;
  recordedAt: string;
}) {
  return createSymphonyTicketExecutionContract({
    contractId: `contract_${input.workflowId}`,
    workflowId: input.workflowId,
    issueIdentifier: input.issueIdentifier,
    repositoryKey: input.repositoryKey,
    summary: input.summary,
    objective: "Prove the intelligent implementation-only router golden path.",
    doneDefinition:
      "Implementation completion is recorded and the workflow shell reaches the expected next state.",
    routingDirectives: {
      requiredCapabilityIds: ["implement.spec"],
      preferredCapabilityIds: [],
      forbiddenCapabilityIds: [],
      requiredEvidenceIds: ["change_set"],
      allowedModelProfileIds: [
        "builder_fast",
        "builder_deep",
        "critic_strict",
        "critic_adversarial",
        "critic_browser"
      ] satisfies SymphonyCapabilityModelProfileId[],
      clarificationPolicy: {
        mode: "required"
      },
      reviewStrictness: "strict",
      maxRetryCount: 2
    },
    createdAt: input.recordedAt,
    updatedAt: input.recordedAt
  });
}

function requireInProgressIssue(harness: RouteLifecycleGoldenPathHarness) {
  const inProgressIssue = harness.tracker.getIssue(harness.issue.id);
  if (!inProgressIssue) {
    throw new TypeError(
      `Expected in-progress issue state for ${harness.issue.identifier}.`
    );
  }

  return inProgressIssue;
}

function buildDeliveredImplementationCompletion(): SymphonyAgentRuntimeCompletion {
  return {
    kind: "delivered",
    moduleResult: buildImplementationModuleResult()
  };
}

function buildAwaitingInputImplementationCompletion(): SymphonyAgentRuntimeCompletion {
  const prompt = "Provide the production API host.";

  return {
    kind: "awaiting_input",
    reason: "Need the production API host before continuing.",
    prompt,
    moduleResult: buildImplementationModuleResult({
      outcome: "awaiting_input",
      summary: "Need the production API host before continuing.",
      requestedState: "awaiting_input",
      nextInputPrompt: prompt
    })
  };
}

function buildImplementationModuleResult(
  overrides: Partial<SymphonyImplementationModuleResult> = {}
): SymphonyImplementationModuleResult {
  return {
    schemaVersion: "1",
    moduleId: "implement.spec",
    outcome: "completed",
    summary: "Implemented the requested issue behavior.",
    evidence: {
      filesChanged: ["apps/api/src/example.ts"],
      verification: [],
      notes: null
    },
    requestedState: "done",
    nextInputPrompt: null,
    blockers: [],
    ...overrides
  };
}

function createNeutralCapabilityPresetFactory() {
  return (
    input: {
      policyId?: SymphonyCapabilityPresetPolicyId;
    } = {}
  ): SymphonyWorkflowCapabilityPreset => {
    const preset = createSymphonyCapabilityPreset({
      policyId: input.policyId
    });

    return {
      capabilities: preset.capabilities.map((definition) => ({
        ...definition
      })),
      modelProfiles: preset.modelProfiles.map((profile) => ({
        ...profile
      })),
      defaultPolicy: {
        requiredCapabilityIds: [],
        preferredCapabilityIds: [],
        forbiddenCapabilityIds: [],
        requiredEvidenceIds: [],
        allowedModelProfileIds: preset.modelProfiles.map((profile) => profile.id),
        clarificationPolicy: {
          mode: "required"
        },
        reviewStrictness: "strict",
        maxRetryCount: 2
      }
    };
  };
}
