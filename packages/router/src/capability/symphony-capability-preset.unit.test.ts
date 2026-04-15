import { describe, expect, it } from "vitest";
import { createWorkflowCapabilityPlanner } from "./capability-planner.js";
import {
  createSymphonyCapabilityCompletedSignal,
  createSymphonyCapabilityStartedSignal,
  createSymphonyTicketExecutionContract
} from "./symphony-capability-contract.js";
import {
  createSymphonyCapabilityPreset
} from "./symphony-capability-preset.js";
import type {
  SymphonyCapabilityPresetPolicyId,
  SymphonyWorkflowCapabilityPreset
} from "./symphony-capability-preset.js";
import type { WorkflowJournalEvent, WorkflowSignal } from "../types/index.js";

describe("Symphony capability preset", () => {
  it("wires the default preset with the first Symphony capabilities and profiles", () => {
    const preset = createSymphonyCapabilityPreset();

    expect(preset.capabilities.map((definition) => definition.id)).toEqual([
      "implement.spec",
      "critic.code_review",
      "critic.adversarial_tests",
      "critic.browser_test"
    ]);
    expect(preset.modelProfiles.map((definition) => definition.id)).toEqual([
      "builder_fast",
      "builder_deep",
      "critic_strict",
      "critic_adversarial",
      "critic_browser"
    ]);
    expect(preset.defaultPolicy).toEqual({
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
    });
  });

  it("keeps capability and model-profile registration compatible for planner construction", () => {
    const preset = createSymphonyCapabilityPreset();

    expect(() =>
      createWorkflowCapabilityPlanner({
        capabilityDefinitions: preset.capabilities,
        modelProfiles: preset.modelProfiles,
        presetPolicy: preset.defaultPolicy
      })
    ).not.toThrow();
  });

  it("keeps browser verification stubbed by default", () => {
    const preset = createSymphonyCapabilityPreset();
    const planner = createPlanner(preset);

    const plan = planner.plan({
      contract: createContract(preset),
      history: createReviewPassedHistory("workflow_default_stubbed"),
      decisionId: "decision_default_stubbed",
      decidedAt: "2026-04-13T05:05:00.000Z"
    });

    expect(
      preset.capabilities.find((definition) => definition.id === "critic.browser_test")
    ).toEqual(
      expect.objectContaining({
        enabledByDefault: false,
        supportedModelProfileIds: ["critic_browser"]
      })
    );
    expect(preset.defaultPolicy.forbiddenCapabilityIds).toEqual([
      "critic.browser_test"
    ]);
    expect(plan).toEqual({
      kind: "ready_for_completion",
      evaluation: expect.objectContaining({
        result: "ready_for_completion",
        missingCapabilityIds: [],
        missingEvidenceIds: []
      })
    });
  });

  it("enables adversarial verification under the backend strict policy", () => {
    const preset = createSymphonyCapabilityPreset({
      policyId: "backend_strict"
    });
    const planner = createPlanner(preset);

    const plan = planner.plan({
      contract: createContract(preset, "backend_strict"),
      history: createReviewPassedHistory("workflow_backend_strict"),
      decisionId: "decision_backend_strict",
      decidedAt: "2026-04-13T05:10:00.000Z"
    });

    expect(plan).toEqual({
      kind: "execute",
      candidate: expect.objectContaining({
        capabilityId: "critic.adversarial_tests",
        workEpoch: 1,
        required: true,
        preferred: true,
        allowedModelProfileIds: ["critic_adversarial"]
      }),
      decision: expect.objectContaining({
        capabilityId: "critic.adversarial_tests",
        modelProfileId: "critic_adversarial",
        workEpoch: 1
      })
    });
  });
});

function createPlanner(preset: SymphonyWorkflowCapabilityPreset) {
  return createWorkflowCapabilityPlanner({
    capabilityDefinitions: preset.capabilities,
    modelProfiles: preset.modelProfiles,
    presetPolicy: preset.defaultPolicy
  });
}

function createContract(
  preset: SymphonyWorkflowCapabilityPreset,
  policyId: SymphonyCapabilityPresetPolicyId = "default"
) {
  const workflowId =
    policyId === "backend_strict"
      ? "workflow_backend_strict"
      : "workflow_default_stubbed";

  return createSymphonyTicketExecutionContract({
    contractId: `contract_${workflowId}`,
    workflowId,
    issueIdentifier:
      policyId === "backend_strict" ? "SYM-BACKEND-STRICT" : "SYM-DEFAULT",
    repositoryKey: "symphony",
    summary: "Exercise the Symphony capability preset.",
    objective: "Validate the first capability preset through planner execution.",
    doneDefinition:
      "The planner routes the default verification path without inventing extra capabilities.",
    routingDirectives: {
      requiredCapabilityIds: [...preset.defaultPolicy.requiredCapabilityIds],
      preferredCapabilityIds: [...preset.defaultPolicy.preferredCapabilityIds],
      forbiddenCapabilityIds: [...preset.defaultPolicy.forbiddenCapabilityIds],
      requiredEvidenceIds: [...preset.defaultPolicy.requiredEvidenceIds],
      allowedModelProfileIds: [...preset.defaultPolicy.allowedModelProfileIds],
      clarificationPolicy: {
        ...preset.defaultPolicy.clarificationPolicy
      },
      reviewStrictness: preset.defaultPolicy.reviewStrictness,
      maxRetryCount: preset.defaultPolicy.maxRetryCount
    },
    createdAt: "2026-04-13T05:00:00.000Z",
    updatedAt: "2026-04-13T05:00:00.000Z"
  });
}

function createReviewPassedHistory(workflowId: string): WorkflowJournalEvent[] {
  return [
    signalRecorded(
      createSymphonyCapabilityStartedSignal({
        id: `signal_${workflowId}_implement_started`,
        occurredAt: "2026-04-13T05:01:00.000Z",
        source: "runtime",
        workflowId,
        executionId: `exec_${workflowId}_implement`,
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        workEpoch: 1,
        attempt: 1,
        summary: "Started implementation.",
        causationId: null,
        correlationId: null
      })
    ),
    signalRecorded(
      createSymphonyCapabilityCompletedSignal({
        id: `signal_${workflowId}_implement_completed`,
        occurredAt: "2026-04-13T05:02:00.000Z",
        source: "runtime",
        workflowId,
        executionId: `exec_${workflowId}_implement`,
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        workEpoch: 1,
        attempt: 1,
        summary: "Completed implementation.",
        evidenceProduced: [
          {
            evidenceId: "change_set",
            summary: "Implementation change set.",
            artifacts: []
          }
        ],
        causationId: null,
        correlationId: null
      })
    ),
    signalRecorded(
      createSymphonyCapabilityStartedSignal({
        id: `signal_${workflowId}_review_started`,
        occurredAt: "2026-04-13T05:03:00.000Z",
        source: "runtime",
        workflowId,
        executionId: `exec_${workflowId}_review`,
        capabilityId: "critic.code_review",
        modelProfileId: "critic_strict",
        workEpoch: 1,
        attempt: 1,
        summary: "Started code review.",
        causationId: null,
        correlationId: null
      })
    ),
    signalRecorded(
      createSymphonyCapabilityCompletedSignal({
        id: `signal_${workflowId}_review_completed`,
        occurredAt: "2026-04-13T05:04:00.000Z",
        source: "runtime",
        workflowId,
        executionId: `exec_${workflowId}_review`,
        capabilityId: "critic.code_review",
        modelProfileId: "critic_strict",
        workEpoch: 1,
        attempt: 1,
        summary: "Completed code review.",
        evidenceProduced: [
          {
            evidenceId: "code_review_report",
            summary: "Review report.",
            artifacts: []
          }
        ],
        causationId: null,
        correlationId: null
      })
    )
  ];
}

function signalRecorded(signal: WorkflowSignal): WorkflowJournalEvent {
  return {
    kind: "signal_recorded",
    signal,
    recordedAt: signal.occurredAt
  };
}
