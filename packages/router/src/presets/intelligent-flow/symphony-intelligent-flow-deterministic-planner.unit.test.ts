import { describe, expect, it } from "vitest";
import {
  createSymphonyCapabilityCompletedSignal,
  createSymphonyCapabilityPreset,
  createSymphonyCapabilityStartedSignal,
  createSymphonyTicketExecutionContract
} from "../../index.js";
import {
  planSymphonyIntelligentFlowDeterministically
} from "./symphony-intelligent-flow-deterministic-planner.js";

describe("Symphony intelligent-flow deterministic planner", () => {
  it("selects implement.spec first from the claimed shell state", () => {
    const contract = createContract();

    const plan = planSymphonyIntelligentFlowDeterministically({
      contract,
      history: [],
      lifecycleState: "claimed",
      decisionId: "decision_intelligent_flow_1",
      decidedAt: "2026-04-13T23:30:00.000Z"
    });

    expect(plan).toEqual({
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
  });

  it("selects critic.code_review once implementation evidence exists", () => {
    const contract = createContract();

    const plan = planSymphonyIntelligentFlowDeterministically({
      contract,
      history: buildImplementationCompletionHistory({
        workflowId: contract.workflowId,
        issueIdentifier: contract.issueIdentifier
      }),
      lifecycleState: "active",
      decisionId: "decision_intelligent_flow_2",
      decidedAt: "2026-04-13T23:31:00.000Z"
    });

    expect(plan).toEqual({
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
  });
});

function createContract() {
  const preset = createSymphonyCapabilityPreset();
  const { mergePolicy, ...routingDirectives } = preset.defaultPolicy;

  return createSymphonyTicketExecutionContract({
    contractId: "contract_intelligent_flow_plan",
    workflowId: "workflow_intelligent_flow_plan",
    issueIdentifier: "SYM-INT-PLAN-1",
    repositoryKey: "openai/symphony",
    summary: "Plan the next intelligent-flow capability.",
    objective: "Select the next admissible module deterministically.",
    doneDefinition: "The planner picks the correct next capability.",
    mergePolicy,
    routingDirectives,
    createdAt: "2026-04-13T23:29:00.000Z",
    updatedAt: "2026-04-13T23:29:00.000Z"
  });
}

function buildImplementationCompletionHistory(input: {
  workflowId: string;
  issueIdentifier: string;
}) {
  const startedAt = "2026-04-13T23:29:30.000Z";
  const completedAt = "2026-04-13T23:29:31.000Z";

  return [
    {
      kind: "signal_recorded" as const,
      recordedAt: startedAt,
      signal: createSymphonyCapabilityStartedSignal({
        id: "signal_started_implement_spec",
        occurredAt: startedAt,
        source: "runtime",
        workflowId: input.workflowId,
        executionId: "exec_implement_spec_1",
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        workEpoch: 1,
        attempt: 1,
        summary: "Started implement.spec.",
        causationId: null,
        correlationId: input.issueIdentifier
      })
    },
    {
      kind: "signal_recorded" as const,
      recordedAt: completedAt,
      signal: createSymphonyCapabilityCompletedSignal({
        id: "signal_completed_implement_spec",
        occurredAt: completedAt,
        source: "runtime",
        workflowId: input.workflowId,
        executionId: "exec_implement_spec_1",
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        workEpoch: 1,
        attempt: 1,
        summary: "Completed implement.spec.",
        evidenceProduced: [
          {
            evidenceId: "change_set",
            summary: "Implementation diff recorded.",
            artifacts: []
          }
        ],
        causationId: null,
        correlationId: input.issueIdentifier
      })
    }
  ];
}
