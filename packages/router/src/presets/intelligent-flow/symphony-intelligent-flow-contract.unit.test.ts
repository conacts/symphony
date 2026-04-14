import { describe, expect, it } from "vitest";
import {
  createSymphonyIntelligentFlowModuleDefinition,
  createSymphonyIntelligentFlowRouterDecision,
  listSymphonyIntelligentFlowDefaultModuleDefinitions,
  parseSymphonyIntelligentFlowLifecycleState,
  parseSymphonyIntelligentFlowModuleId,
  readSymphonyIntelligentFlowAdmissibilitySnapshot,
  readSymphonyIntelligentFlowSelectionResponse
} from "./symphony-intelligent-flow-contract.js";

describe("Symphony intelligent-flow contract", () => {
  it("parses the frozen lifecycle shell and module ids", () => {
    expect(parseSymphonyIntelligentFlowLifecycleState("active")).toBe("active");
    expect(parseSymphonyIntelligentFlowModuleId("critic.code_review")).toBe(
      "critic.code_review"
    );
  });

  it("builds and reads strict intelligent-flow module definitions", () => {
    const module = createSymphonyIntelligentFlowModuleDefinition({
      id: "implement.spec",
      phase: "implementing",
      summary: "Implement the requested slice.",
      description: "Produces the canonical change set for the workflow.",
      executionKind: "agent",
      enabledByDefault: true,
      supportedModelProfileIds: ["builder_fast"],
      producesEvidenceIds: ["change_set"],
      requiresEvidenceIds: [],
      requiredRuntimeSupportFlags: [],
      allowedLifecycleStates: ["active"],
      allowedOutcomeKinds: [
        "completed",
        "changes_requested",
        "clarification_requested",
        "blocked",
        "failed",
        "paused"
      ],
      requiresNoPendingClarification: true,
      canRunWhenBlocked: false
    });

    expect(module).toEqual(
      expect.objectContaining({
        id: "implement.spec",
        executionKind: "agent",
        supportedModelProfileIds: ["builder_fast"]
      })
    );
  });

  it("fails fast when an agent module omits supported model profiles", () => {
    expect(() =>
      createSymphonyIntelligentFlowModuleDefinition({
        id: "implement.spec",
        phase: "implementing",
        summary: "Broken module",
        description: "Agent module with no model profile.",
        executionKind: "agent",
        enabledByDefault: true,
        supportedModelProfileIds: [],
        producesEvidenceIds: ["change_set"],
        requiresEvidenceIds: [],
        requiredRuntimeSupportFlags: [],
        allowedLifecycleStates: ["active"],
        allowedOutcomeKinds: ["completed"],
        requiresNoPendingClarification: true,
        canRunWhenBlocked: false
      })
    ).toThrow(/require at least one supported model profile id/i);
  });

  it("fails fast when a system module declares model profiles", () => {
    expect(() =>
      createSymphonyIntelligentFlowModuleDefinition({
        id: "merge.execute",
        phase: "merging",
        summary: "Broken merge module",
        description: "System module must not declare model profiles.",
        executionKind: "system",
        enabledByDefault: true,
        supportedModelProfileIds: ["critic_strict"],
        producesEvidenceIds: ["merge_result_record"],
        requiresEvidenceIds: ["change_set"],
        requiredRuntimeSupportFlags: [],
        allowedLifecycleStates: ["active"],
        allowedOutcomeKinds: ["merged"],
        requiresNoPendingClarification: true,
        canRunWhenBlocked: false
      })
    ).toThrow(/must not declare supported model profile ids/i);
  });

  it("fails fast when a non-blockable module allows the blocked lifecycle state", () => {
    expect(() =>
      createSymphonyIntelligentFlowModuleDefinition({
        id: "critic.code_review",
        phase: "verifying",
        summary: "Broken review module",
        description: "Contradictory blocked settings should fail.",
        executionKind: "agent",
        enabledByDefault: true,
        supportedModelProfileIds: ["critic_strict"],
        producesEvidenceIds: ["code_review_report"],
        requiresEvidenceIds: ["change_set"],
        requiredRuntimeSupportFlags: [],
        allowedLifecycleStates: ["active", "blocked"],
        allowedOutcomeKinds: ["completed", "changes_requested"],
        requiresNoPendingClarification: true,
        canRunWhenBlocked: false
      })
    ).toThrow(/must not allow the blocked lifecycle state/i);
  });

  it("fails fast when a non-merging module declares merge outcomes", () => {
    expect(() =>
      createSymphonyIntelligentFlowModuleDefinition({
        id: "blocked.report",
        phase: "reporting",
        summary: "Broken reporting module",
        description: "Only merging modules can return merged outcomes.",
        executionKind: "system",
        enabledByDefault: true,
        supportedModelProfileIds: [],
        producesEvidenceIds: [],
        requiresEvidenceIds: [],
        requiredRuntimeSupportFlags: [],
        allowedLifecycleStates: ["active"],
        allowedOutcomeKinds: ["merged"],
        requiresNoPendingClarification: true,
        canRunWhenBlocked: false
      })
    ).toThrow(/only merging modules may declare merged or merge_blocked outcomes/i);
  });

  it("reads strict admissibility snapshots and rejects duplicated module ids", () => {
    expect(
      readSymphonyIntelligentFlowAdmissibilitySnapshot({
        admissible: [
          {
            moduleId: "implement.spec",
            rank: 0,
            reasonCode: "required_by_contract",
            summary: "Implementation is required first."
          }
        ],
        rejected: [
          {
            moduleId: "critic.browser_test",
            reasonCode: "disabled_by_default",
            summary: "Browser verification is disabled in the default preset."
          }
        ]
      })
    ).toEqual(
      expect.objectContaining({
        admissible: [
          expect.objectContaining({
            moduleId: "implement.spec"
          })
        ]
      })
    );

    expect(() =>
      readSymphonyIntelligentFlowAdmissibilitySnapshot({
        admissible: [
          {
            moduleId: "implement.spec",
            rank: 0,
            reasonCode: "required_by_contract",
            summary: "Implementation is required first."
          }
        ],
        rejected: [
          {
            moduleId: "implement.spec",
            reasonCode: "already_satisfied",
            summary: "This duplicate should fail."
          }
        ]
      })
    ).toThrow(/cannot appear in both admissible and rejected candidate sets/i);
  });

  it("reads strict selection responses and rejects out-of-range confidence", () => {
    expect(
      readSymphonyIntelligentFlowSelectionResponse({
        selectedModuleId: "critic.code_review",
        reason: "Verification is the next best bounded step.",
        confidence: 0.82,
        deferToDeterministicFallback: false
      })
    ).toEqual(
      expect.objectContaining({
        selectedModuleId: "critic.code_review",
        confidence: 0.82
      })
    );

    expect(() =>
      readSymphonyIntelligentFlowSelectionResponse({
        selectedModuleId: "critic.code_review",
        reason: "Broken confidence.",
        confidence: 1.5,
        deferToDeterministicFallback: false
      })
    ).toThrow(/invalid symphony intelligent-flow selection response/i);
  });

  it("builds and reads router decisions with selected modules constrained to the admissible set", () => {
    const decision = createSymphonyIntelligentFlowRouterDecision({
      decisionId: "decision_workflow_sym_700_1",
      workflowId: "workflow_sym_700",
      policyId: "intelligent-default",
      recordedAt: "2026-04-13T22:30:00.000Z",
      candidateSet: {
        admissible: [
          {
            moduleId: "implement.spec",
            rank: 0,
            reasonCode: "required_by_contract",
            summary: "Implementation is required first."
          },
          {
            moduleId: "critic.code_review",
            rank: 1,
            reasonCode: "verification_follow_up",
            summary: "Code review is admissible after implementation."
          }
        ],
        rejected: [
          {
            moduleId: "critic.browser_test",
            reasonCode: "disabled_by_default",
            summary: "Browser verification is disabled in the default preset."
          }
        ]
      },
      selectedModuleId: "implement.spec",
      selectionMode: "llm_selected",
      selectionSummary: "Implementation is the next bounded step.",
      selectionRationale:
        "The ticket lacks a change set, so implementation should run before any verifier module.",
      confidence: 0.91,
      inputProjectionFingerprint: "projection:workflow_sym_700:10",
      fallbackReason: null
    });

    expect(decision).toEqual(
      expect.objectContaining({
        selectedModuleId: "implement.spec",
        selectionMode: "llm_selected",
        confidence: 0.91
      })
    );
  });

  it("fails fast when a router decision selects a module outside the admissible set", () => {
    expect(() =>
      createSymphonyIntelligentFlowRouterDecision({
        decisionId: "decision_invalid_selected_module",
        workflowId: "workflow_invalid_selected_module",
        policyId: "intelligent-default",
        recordedAt: "2026-04-13T22:31:00.000Z",
        candidateSet: {
          admissible: [
            {
              moduleId: "implement.spec",
              rank: 0,
              reasonCode: "required_by_contract",
              summary: "Implementation is required first."
            }
          ],
          rejected: []
        },
        selectedModuleId: "critic.code_review",
        selectionMode: "deterministic",
        selectionSummary: "Broken decision",
        selectionRationale: "This should fail.",
        confidence: null,
        inputProjectionFingerprint: "projection:workflow_invalid_selected_module:1",
        fallbackReason: null
      })
    ).toThrow(/must appear in the admissible candidate set/i);
  });

  it("fails fast when llm-selected decisions omit confidence or fallback decisions omit a reason", () => {
    expect(() =>
      createSymphonyIntelligentFlowRouterDecision({
        decisionId: "decision_missing_confidence",
        workflowId: "workflow_missing_confidence",
        policyId: "intelligent-default",
        recordedAt: "2026-04-13T22:32:00.000Z",
        candidateSet: {
          admissible: [
            {
              moduleId: "implement.spec",
              rank: 0,
              reasonCode: "required_by_contract",
              summary: "Implementation is required first."
            }
          ],
          rejected: []
        },
        selectedModuleId: "implement.spec",
        selectionMode: "llm_selected",
        selectionSummary: "Broken decision",
        selectionRationale: "Confidence is required here.",
        confidence: null,
        inputProjectionFingerprint: "projection:workflow_missing_confidence:1",
        fallbackReason: null
      })
    ).toThrow(/require a confidence value/i);

    expect(() =>
      createSymphonyIntelligentFlowRouterDecision({
        decisionId: "decision_missing_fallback_reason",
        workflowId: "workflow_missing_fallback_reason",
        policyId: "intelligent-default",
        recordedAt: "2026-04-13T22:33:00.000Z",
        candidateSet: {
          admissible: [
            {
              moduleId: "implement.spec",
              rank: 0,
              reasonCode: "required_by_contract",
              summary: "Implementation is required first."
            }
          ],
          rejected: []
        },
        selectedModuleId: "implement.spec",
        selectionMode: "fallback_default",
        selectionSummary: "Broken fallback decision",
        selectionRationale: "Fallback reason is required.",
        confidence: null,
        inputProjectionFingerprint:
          "projection:workflow_missing_fallback_reason:1",
        fallbackReason: null
      })
    ).toThrow(/require a fallback reason/i);
  });

  it("ships a frozen default module catalog for later intelligent-flow slices", () => {
    expect(listSymphonyIntelligentFlowDefaultModuleDefinitions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "implement.spec",
          executionKind: "agent"
        }),
        expect.objectContaining({
          id: "merge.execute",
          executionKind: "system",
          phase: "merging"
        }),
        expect.objectContaining({
          id: "critic.browser_test",
          enabledByDefault: false,
          requiredRuntimeSupportFlags: ["browser_automation"]
        })
      ])
    );
  });
});
