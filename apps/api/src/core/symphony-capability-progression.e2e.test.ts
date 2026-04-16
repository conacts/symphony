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
    const observed =
      await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T10:10:31.000Z"
      });
    expect(observed).toEqual({
      issueIdentifier: harness.issue.identifier,
      observedTrackerState: "Done",
      workflowTrackerState: "Done",
      observed: false,
      disposition: "skipped"
    });

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

  it("replans the same implementation capability after clarification is answered at the runtime boundary", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo",
      createIntelligentFlowCapabilityPreset: createNeutralCapabilityPresetFactory()
    });
    await advanceWorkflowToRunningImplementation(harness);

    const workflowId = await loadRequiredWorkflowId(harness);
    await persistImplementationOnlyContract(harness, workflowId, "2026-04-13T10:30:29.000Z");

    const inProgressIssue = requireInProgressIssue(harness);
    await harness.service.workflowRoutingAdapter.routeRunCompletion({
      issue: inProgressIssue,
      runId: "run-1",
      runMode: "implementation",
      completion: buildAwaitingInputImplementationCompletion(),
      recordedAt: "2026-04-13T10:30:30.000Z"
    });

    const pending = await harness.capabilityOperator.inspectByIssueIdentifier({
      issueIdentifier: harness.issue.identifier,
      recordedAt: "2026-04-13T10:30:31.000Z"
    });
    expect(pending).toEqual({
      capability: expect.objectContaining({
        workflowId,
        planKind: "awaiting_input",
        capabilityId: "implement.spec",
        workEpoch: 1,
        pendingClarification: expect.objectContaining({
          answerPath: `/api/v1/${harness.issue.identifier}/clarification-answer`,
          requestId: expect.any(String),
          raisedByCapabilityId: "implement.spec",
          workEpoch: 1
        })
      }),
      pendingClarification: expect.objectContaining({
        answerPath: `/api/v1/${harness.issue.identifier}/clarification-answer`,
        requestId: expect.any(String),
        raisedByCapabilityId: "implement.spec",
        workEpoch: 1
      })
    });

    if (
      !pending ||
      pending.capability === null ||
      pending.pendingClarification === null
    ) {
      throw new TypeError("Expected a pending clarification after awaiting_input.");
    }
    const [question] = pending.pendingClarification.questions;
    if (!question) {
      throw new TypeError("Expected the pending clarification to include a question.");
    }

    const answered = await harness.capabilityOperator.answerPendingClarificationByWorkflowId({
      workflowId: pending.capability.workflowId,
      recordedAt: "2026-04-13T10:30:32.000Z",
      requestId: pending.pendingClarification.requestId,
      answers: {
        [question.id]: "Use https://api.example.com as the production API host."
      }
    });

    expect(answered).toEqual(
      expect.objectContaining({
        issueIdentifier: harness.issue.identifier,
        workflowId,
        requestId: pending.pendingClarification.requestId,
        capability: expect.objectContaining({
          planKind: "execute",
          capabilityId: "implement.spec",
          workEpoch: 1,
          pendingClarification: null
        })
      })
    );
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Progress");

    const hydration =
      await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyIntelligentFlowNode,
        SymphonyIntelligentFlowData,
        SymphonyIntelligentFlowPolicy
      >(harness.issue.identifier);
    expect(hydration?.snapshot?.projection.currentNode).toBe("claimed");

    const signalTypes = await listRecordedWorkflowSignalTypes(harness, workflowId);
    expect(signalTypes).toEqual(
      expect.arrayContaining([
        "workflow.clarification_requested",
        "workflow.clarification_answered"
      ])
    );
  });

  it("completes after clarification is answered and the resumed implementation run finishes", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo",
      createIntelligentFlowCapabilityPreset: createNeutralCapabilityPresetFactory()
    });
    await advanceWorkflowToRunningImplementation(harness);

    const workflowId = await loadRequiredWorkflowId(harness);
    await persistImplementationOnlyContract(harness, workflowId, "2026-04-13T10:40:29.000Z");

    const inProgressIssue = requireInProgressIssue(harness);
    await harness.service.workflowRoutingAdapter.routeRunCompletion({
      issue: inProgressIssue,
      runId: "run-1",
      runMode: "implementation",
      completion: buildAwaitingInputImplementationCompletion(),
      recordedAt: "2026-04-13T10:40:30.000Z"
    });

    const pending = await harness.capabilityOperator.inspectByIssueIdentifier({
      issueIdentifier: harness.issue.identifier,
      recordedAt: "2026-04-13T10:40:31.000Z"
    });
    if (
      !pending ||
      pending.capability === null ||
      pending.pendingClarification === null
    ) {
      throw new TypeError("Expected a pending clarification before resuming.");
    }
    const [question] = pending.pendingClarification.questions;
    if (!question) {
      throw new TypeError("Expected the pending clarification to include a question.");
    }

    await harness.capabilityOperator.answerPendingClarificationByWorkflowId({
      workflowId: pending.capability.workflowId,
      recordedAt: "2026-04-13T10:40:32.000Z",
      requestId: pending.pendingClarification.requestId,
      answers: {
        [question.id]: "Use https://api.example.com as the production API host."
      }
    });

    const resumedIssue = requireInProgressIssue(harness);
    const resumed = await harness.service.workflowRoutingAdapter.activateRunStart({
      issue: resumedIssue,
      runId: "run-2",
      runMode: "implementation",
      threadId: "thread-2",
      workerHost: null,
      launchTarget: null,
      recordedAt: "2026-04-13T10:40:33.000Z"
    });
    const completed = await harness.service.workflowRoutingAdapter.routeRunCompletion({
      issue: resumed.issue,
      runId: "run-2",
      runMode: "implementation",
      completion: buildDeliveredImplementationCompletion(),
      recordedAt: "2026-04-13T10:40:34.000Z"
    });

    expect(completed).toEqual({
      issue: expect.objectContaining({
        id: harness.issue.id,
        state: "Done"
      }),
      continueWithRunMode: null
    });
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");

    const workflowLifecycle = await harness.service.loadWorkflowLifecycleView({
      issueIdentifier: harness.issue.identifier,
      runId: "run-2"
    });
    expect(workflowLifecycle).toEqual(
      expect.objectContaining({
        workflowId,
        trackerState: "Done"
      })
    );

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
        "workflow.clarification_requested",
        "workflow.clarification_answered",
        "runtime.completed"
      ])
    );
    expect(countSignalType(signalTypes, "capability.started")).toBe(2);
    expect(countSignalType(signalTypes, "capability.completed")).toBe(1);
  });

  it("transitions capability-managed blocked completions into Blocked instead of leaving the shell active", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo",
      createIntelligentFlowCapabilityPreset: createNeutralCapabilityPresetFactory()
    });
    await advanceWorkflowToRunningImplementation(harness);

    const workflowId = await loadRequiredWorkflowId(harness);
    await persistImplementationOnlyContract(harness, workflowId, "2026-04-13T10:50:29.000Z");

    const inProgressIssue = requireInProgressIssue(harness);
    const routed = await harness.service.workflowRoutingAdapter.routeRunCompletion({
      issue: inProgressIssue,
      runId: "run-1",
      runMode: "implementation",
      completion: buildBlockedImplementationCompletion(),
      recordedAt: "2026-04-13T10:50:30.000Z"
    });

    expect(routed.issue.state).toBe("Blocked");
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Blocked");

    const nextPlanning = await harness.capabilityPlanning.planByWorkflowId({
      workflowId,
      recordedAt: "2026-04-13T10:50:32.000Z"
    });
    expect(nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "blocked",
        reason: "Blocked while executing implement.spec."
      })
    );

    const workflowLifecycle = await harness.service.loadWorkflowLifecycleView({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1"
    });
    expect(workflowLifecycle).toEqual(
      expect.objectContaining({
        workflowId,
        trackerState: "Blocked"
      })
    );

    const hydration =
      await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyIntelligentFlowNode,
        SymphonyIntelligentFlowData,
        SymphonyIntelligentFlowPolicy
      >(harness.issue.identifier);
    expect(hydration?.snapshot?.projection.currentNode).toBe("blocked");

    const signalTypes = await listRecordedWorkflowSignalTypes(harness, workflowId);
    expect(signalTypes).toEqual(
      expect.arrayContaining(["capability.started", "capability.blocked"])
    );
    expect(signalTypes).not.toContain("runtime.shutdown_requested");
  });

  it("chains implementation into code review and closes on the second capability-managed completion", async () => {
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
      recordedAt: "2026-04-13T11:00:29.000Z"
    });

    const firstIssue = requireInProgressIssue(harness);
    const firstCompletion = await harness.service.workflowRoutingAdapter.routeRunCompletion({
      issue: firstIssue,
      runId: "run-1",
      runMode: "implementation",
      completion: {
        kind: "delivered"
      },
      recordedAt: "2026-04-13T11:00:30.000Z"
    });

    expect(firstCompletion).toEqual({
      issue: expect.objectContaining({
        id: harness.issue.id,
        state: "In Progress"
      }),
      continueWithRunMode: "implementation"
    });

    const reviewIssue = requireInProgressIssue(harness);
    const reviewStarted = await harness.service.workflowRoutingAdapter.activateRunStart({
      issue: reviewIssue,
      runId: "run-2",
      runMode: "implementation",
      threadId: "thread-2",
      workerHost: null,
      launchTarget: null,
      recordedAt: "2026-04-13T11:00:31.000Z"
    });
    const completed = await harness.service.workflowRoutingAdapter.routeRunCompletion({
      issue: reviewStarted.issue,
      runId: "run-2",
      runMode: "implementation",
      completion: {
        kind: "delivered"
      },
      recordedAt: "2026-04-13T11:00:32.000Z"
    });

    expect(completed).toEqual({
      issue: expect.objectContaining({
        id: harness.issue.id,
        state: "Done"
      }),
      continueWithRunMode: null
    });
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");

    const workflowLifecycle = await harness.service.loadWorkflowLifecycleView({
      issueIdentifier: harness.issue.identifier,
      runId: "run-2"
    });
    expect(workflowLifecycle).toEqual(
      expect.objectContaining({
        workflowId,
        trackerState: "Done"
      })
    );

    const hydration =
      await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyIntelligentFlowNode,
        SymphonyIntelligentFlowData,
        SymphonyIntelligentFlowPolicy
      >(harness.issue.identifier);
    expect(hydration?.snapshot?.projection.currentNode).toBe("done");

    const signalTypes = await listRecordedWorkflowSignalTypes(harness, workflowId);
    expect(countSignalType(signalTypes, "capability.started")).toBe(2);
    expect(countSignalType(signalTypes, "capability.completed")).toBe(2);
    expect(signalTypes).toEqual(
      expect.arrayContaining(["runtime.completed"])
    );
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

function buildBlockedImplementationCompletion(): SymphonyAgentRuntimeCompletion {
  return {
    kind: "blocked",
    reason: "Blocked while executing implement.spec.",
    moduleResult: buildImplementationModuleResult({
      outcome: "blocked",
      summary: "Blocked while executing implement.spec.",
      requestedState: "blocked",
      blockers: ["waiting on production API host"]
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

function countSignalType(signalTypes: string[], signalType: string) {
  return signalTypes.filter((candidate) => candidate === signalType).length;
}
