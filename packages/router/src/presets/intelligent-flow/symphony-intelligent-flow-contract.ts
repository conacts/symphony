import { z } from "zod";
import {
  type SymphonyCapabilityModelProfileId
} from "../../capability/symphony-capability-contract.js";

const workflowTimestampSchema = z.string().datetime({ offset: true });
const workflowRequiredTextSchema = z.string().trim().min(1);
const workflowNullableTextSchema = workflowRequiredTextSchema.nullable();
const workflowConfidenceSchema = z.number().min(0).max(1);

const symphonyIntelligentFlowLifecycleStates = [
  "queued",
  "claimed",
  "active",
  "awaiting_input",
  "blocked",
  "paused",
  "failed",
  "done"
] as const;

const symphonyIntelligentFlowModulePhases = [
  "intaking",
  "implementing",
  "verifying",
  "reporting"
] as const;

const symphonyIntelligentFlowModuleIds = [
  "intake.review",
  "implement.spec",
  "critic.code_review",
  "critic.adversarial_tests",
  "critic.browser_test",
  "blocked.report"
] as const;

const symphonyIntelligentFlowEvidenceIds = [
  "change_set",
  "code_review_report",
  "adversarial_test_report",
  "browser_test_report"
] as const;

const symphonyIntelligentFlowRuntimeSupportFlagIds = [
  "browser_automation"
] as const;

const symphonyIntelligentFlowExecutionKinds = [
  "agent",
  "system"
] as const;

const symphonyIntelligentFlowExecutionContractRequirements = [
  "missing",
  "persisted"
] as const;

const symphonyIntelligentFlowModuleOutcomeKinds = [
  "completed",
  "changes_requested",
  "clarification_requested",
  "blocked",
  "failed",
  "paused"
] as const;

const symphonyIntelligentFlowAdmissibleReasonCodes = [
  "required_by_contract",
  "preferred_by_contract",
  "verification_follow_up",
  "completion_follow_up",
  "recovery_retry"
] as const;

const symphonyIntelligentFlowRejectedReasonCodes = [
  "disabled_by_default",
  "execution_contract_state_mismatch",
  "forbidden_by_policy",
  "unsupported_runtime",
  "pending_clarification",
  "blocked_by_lifecycle",
  "retry_budget_exhausted",
  "missing_required_evidence",
  "already_satisfied"
] as const;

const symphonyIntelligentFlowSelectionModes = [
  "deterministic",
  "llm_selected",
  "fallback_default",
  "reused_cached_decision"
] as const;

export type SymphonyIntelligentFlowLifecycleState =
  (typeof symphonyIntelligentFlowLifecycleStates)[number];
export type SymphonyIntelligentFlowModulePhase =
  (typeof symphonyIntelligentFlowModulePhases)[number];
export type SymphonyIntelligentFlowModuleId =
  (typeof symphonyIntelligentFlowModuleIds)[number];
export type SymphonyIntelligentFlowEvidenceId =
  (typeof symphonyIntelligentFlowEvidenceIds)[number];
export type SymphonyIntelligentFlowRuntimeSupportFlagId =
  (typeof symphonyIntelligentFlowRuntimeSupportFlagIds)[number];
export type SymphonyIntelligentFlowExecutionKind =
  (typeof symphonyIntelligentFlowExecutionKinds)[number];
export type SymphonyIntelligentFlowExecutionContractRequirement =
  (typeof symphonyIntelligentFlowExecutionContractRequirements)[number];
export type SymphonyIntelligentFlowModuleOutcomeKind =
  (typeof symphonyIntelligentFlowModuleOutcomeKinds)[number];
export type SymphonyIntelligentFlowAdmissibleReasonCode =
  (typeof symphonyIntelligentFlowAdmissibleReasonCodes)[number];
export type SymphonyIntelligentFlowRejectedReasonCode =
  (typeof symphonyIntelligentFlowRejectedReasonCodes)[number];
export type SymphonyIntelligentFlowSelectionMode =
  (typeof symphonyIntelligentFlowSelectionModes)[number];

export const symphonyIntelligentFlowLifecycleStateSchema = z.enum(
  symphonyIntelligentFlowLifecycleStates
);
export const symphonyIntelligentFlowModulePhaseSchema = z.enum(
  symphonyIntelligentFlowModulePhases
);
export const symphonyIntelligentFlowModuleIdSchema = z.enum(
  symphonyIntelligentFlowModuleIds
);
export const symphonyIntelligentFlowEvidenceIdSchema = z.enum(
  symphonyIntelligentFlowEvidenceIds
);
export const symphonyIntelligentFlowRuntimeSupportFlagIdSchema = z.enum(
  symphonyIntelligentFlowRuntimeSupportFlagIds
);
export const symphonyIntelligentFlowExecutionKindSchema = z.enum(
  symphonyIntelligentFlowExecutionKinds
);
export const symphonyIntelligentFlowExecutionContractRequirementSchema = z.enum(
  symphonyIntelligentFlowExecutionContractRequirements
);
export const symphonyIntelligentFlowModuleOutcomeKindSchema = z.enum(
  symphonyIntelligentFlowModuleOutcomeKinds
);
export const symphonyIntelligentFlowAdmissibleReasonCodeSchema = z.enum(
  symphonyIntelligentFlowAdmissibleReasonCodes
);
export const symphonyIntelligentFlowRejectedReasonCodeSchema = z.enum(
  symphonyIntelligentFlowRejectedReasonCodes
);
export const symphonyIntelligentFlowSelectionModeSchema = z.enum(
  symphonyIntelligentFlowSelectionModes
);

function createUniqueEnumArraySchema<const Values extends readonly [string, ...string[]]>(
  values: Values,
  label: string
) {
  return z.array(z.enum(values)).superRefine((items, context) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate ${label}: ${item}.`
        });
        return;
      }

      seen.add(item);
    }
  });
}

export const symphonyIntelligentFlowModuleDefinitionSchema = z
  .object({
    id: symphonyIntelligentFlowModuleIdSchema,
    phase: symphonyIntelligentFlowModulePhaseSchema,
    summary: workflowRequiredTextSchema,
    description: workflowRequiredTextSchema,
    executionKind: symphonyIntelligentFlowExecutionKindSchema,
    executionContractRequirement:
      symphonyIntelligentFlowExecutionContractRequirementSchema,
    enabledByDefault: z.boolean(),
    supportedModelProfileIds: createUniqueEnumArraySchema(
      [
        "builder_fast",
        "builder_deep",
        "critic_strict",
        "critic_adversarial",
        "critic_browser"
      ] as const,
      "supported model profile id"
    ),
    producesEvidenceIds: createUniqueEnumArraySchema(
      symphonyIntelligentFlowEvidenceIds,
      "produced evidence id"
    ),
    requiresEvidenceIds: createUniqueEnumArraySchema(
      symphonyIntelligentFlowEvidenceIds,
      "required evidence id"
    ),
    requiredRuntimeSupportFlags: createUniqueEnumArraySchema(
      symphonyIntelligentFlowRuntimeSupportFlagIds,
      "required runtime support flag"
    ),
    allowedLifecycleStates: createUniqueEnumArraySchema(
      symphonyIntelligentFlowLifecycleStates,
      "allowed lifecycle state"
    ).nonempty(),
    allowedOutcomeKinds: createUniqueEnumArraySchema(
      symphonyIntelligentFlowModuleOutcomeKinds,
      "allowed outcome kind"
    ).nonempty(),
    requiresNoPendingClarification: z.boolean(),
    canRunWhenBlocked: z.boolean()
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.executionKind === "agent" &&
      value.supportedModelProfileIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Agent-executed intelligent-flow modules require at least one supported model profile id.",
        path: ["supportedModelProfileIds"]
      });
    }

    if (
      value.executionKind === "system" &&
      value.supportedModelProfileIds.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "System-executed intelligent-flow modules must not declare supported model profile ids.",
        path: ["supportedModelProfileIds"]
      });
    }

    if (
      value.canRunWhenBlocked === false &&
      value.allowedLifecycleStates.includes("blocked")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Modules that cannot run when blocked must not allow the blocked lifecycle state.",
        path: ["allowedLifecycleStates"]
      });
    }

  });

export const symphonyIntelligentFlowRuntimeSupportSchema = z
  .object({
    browser_automation: z.boolean()
  })
  .strict();

export const symphonyIntelligentFlowAdmissibleCandidateSchema = z
  .object({
    moduleId: symphonyIntelligentFlowModuleIdSchema,
    rank: z.number().int().nonnegative(),
    reasonCode: symphonyIntelligentFlowAdmissibleReasonCodeSchema,
    summary: workflowRequiredTextSchema
  })
  .strict();

export const symphonyIntelligentFlowRejectedCandidateSchema = z
  .object({
    moduleId: symphonyIntelligentFlowModuleIdSchema,
    reasonCode: symphonyIntelligentFlowRejectedReasonCodeSchema,
    summary: workflowRequiredTextSchema
  })
  .strict();

export const symphonyIntelligentFlowAdmissibilitySnapshotSchema = z
  .object({
    admissible: z.array(symphonyIntelligentFlowAdmissibleCandidateSchema),
    rejected: z.array(symphonyIntelligentFlowRejectedCandidateSchema)
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Map<string, "admissible" | "rejected">();

    for (const candidate of value.admissible) {
      if (seen.has(candidate.moduleId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate admissibility entry for module ${candidate.moduleId}.`,
          path: ["admissible"]
        });
        return;
      }
      seen.set(candidate.moduleId, "admissible");
    }

    for (const candidate of value.rejected) {
      if (seen.has(candidate.moduleId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `Module ${candidate.moduleId} cannot appear in both admissible and rejected candidate sets.`,
          path: ["rejected"]
        });
        return;
      }
      seen.set(candidate.moduleId, "rejected");
    }
  });

export const symphonyIntelligentFlowSelectionResponseSchema = z
  .object({
    selectedModuleId: symphonyIntelligentFlowModuleIdSchema,
    reason: workflowRequiredTextSchema,
    confidence: workflowConfidenceSchema,
    deferToDeterministicFallback: z.boolean()
  })
  .strict();

export const symphonyIntelligentFlowRouterDecisionSchema = z
  .object({
    decisionId: workflowRequiredTextSchema,
    workflowId: workflowRequiredTextSchema,
    policyId: workflowRequiredTextSchema,
    recordedAt: workflowTimestampSchema,
    candidateSet: symphonyIntelligentFlowAdmissibilitySnapshotSchema,
    selectedModuleId: symphonyIntelligentFlowModuleIdSchema,
    selectionMode: symphonyIntelligentFlowSelectionModeSchema,
    selectionSummary: workflowRequiredTextSchema,
    selectionRationale: workflowRequiredTextSchema,
    confidence: workflowConfidenceSchema.nullable(),
    inputProjectionFingerprint: workflowRequiredTextSchema,
    fallbackReason: workflowNullableTextSchema
  })
  .strict()
  .superRefine((value, context) => {
    const admissibleModuleIds = new Set(
      value.candidateSet.admissible.map((candidate) => candidate.moduleId)
    );
    if (!admissibleModuleIds.has(value.selectedModuleId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Selected module ${value.selectedModuleId} must appear in the admissible candidate set.`,
        path: ["selectedModuleId"]
      });
    }

    if (value.selectionMode === "llm_selected" && value.confidence === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "LLM-selected intelligent-flow router decisions require a confidence value.",
        path: ["confidence"]
      });
    }

    if (
      value.selectionMode === "fallback_default" &&
      value.fallbackReason === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Fallback-default intelligent-flow router decisions require a fallback reason.",
        path: ["fallbackReason"]
      });
    }
  });

export type SymphonyIntelligentFlowModuleDefinition = z.infer<
  typeof symphonyIntelligentFlowModuleDefinitionSchema
>;
export type SymphonyIntelligentFlowAdmissibleCandidate = z.infer<
  typeof symphonyIntelligentFlowAdmissibleCandidateSchema
>;
export type SymphonyIntelligentFlowRejectedCandidate = z.infer<
  typeof symphonyIntelligentFlowRejectedCandidateSchema
>;
export type SymphonyIntelligentFlowAdmissibilitySnapshot = z.infer<
  typeof symphonyIntelligentFlowAdmissibilitySnapshotSchema
>;
export type SymphonyIntelligentFlowSelectionResponse = z.infer<
  typeof symphonyIntelligentFlowSelectionResponseSchema
>;
export type SymphonyIntelligentFlowRouterDecision = z.infer<
  typeof symphonyIntelligentFlowRouterDecisionSchema
>;
export type SymphonyIntelligentFlowRuntimeSupport = z.infer<
  typeof symphonyIntelligentFlowRuntimeSupportSchema
>;

export function parseSymphonyIntelligentFlowLifecycleState(
  value: unknown
): SymphonyIntelligentFlowLifecycleState {
  return symphonyIntelligentFlowLifecycleStateSchema.parse(value);
}

export function parseSymphonyIntelligentFlowModuleId(
  value: unknown
): SymphonyIntelligentFlowModuleId {
  return symphonyIntelligentFlowModuleIdSchema.parse(value);
}

export function parseSymphonyIntelligentFlowEvidenceId(
  value: unknown
): SymphonyIntelligentFlowEvidenceId {
  return symphonyIntelligentFlowEvidenceIdSchema.parse(value);
}

export function parseSymphonyIntelligentFlowRuntimeSupportFlagId(
  value: unknown
): SymphonyIntelligentFlowRuntimeSupportFlagId {
  return symphonyIntelligentFlowRuntimeSupportFlagIdSchema.parse(value);
}

export function parseSymphonyIntelligentFlowSelectionMode(
  value: unknown
): SymphonyIntelligentFlowSelectionMode {
  return symphonyIntelligentFlowSelectionModeSchema.parse(value);
}

export function createSymphonyIntelligentFlowModuleDefinition(
  value: SymphonyIntelligentFlowModuleDefinition
): SymphonyIntelligentFlowModuleDefinition {
  return symphonyIntelligentFlowModuleDefinitionSchema.parse(value);
}

export function readSymphonyIntelligentFlowModuleDefinition(
  value: unknown
): SymphonyIntelligentFlowModuleDefinition {
  try {
    return symphonyIntelligentFlowModuleDefinitionSchema.parse(value);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony intelligent-flow module definition: ${String(error)}`,
      { cause: error }
    );
  }
}

export function createSymphonyIntelligentFlowRouterDecision(
  value: SymphonyIntelligentFlowRouterDecision
): SymphonyIntelligentFlowRouterDecision {
  return symphonyIntelligentFlowRouterDecisionSchema.parse(value);
}

export function readSymphonyIntelligentFlowRouterDecision(
  value: unknown
): SymphonyIntelligentFlowRouterDecision {
  try {
    return symphonyIntelligentFlowRouterDecisionSchema.parse(value);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony intelligent-flow router decision: ${String(error)}`,
      { cause: error }
    );
  }
}

export function readSymphonyIntelligentFlowAdmissibilitySnapshot(
  value: unknown
): SymphonyIntelligentFlowAdmissibilitySnapshot {
  try {
    return symphonyIntelligentFlowAdmissibilitySnapshotSchema.parse(value);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony intelligent-flow admissibility snapshot: ${String(error)}`,
      { cause: error }
    );
  }
}

export function readSymphonyIntelligentFlowSelectionResponse(
  value: unknown
): SymphonyIntelligentFlowSelectionResponse {
  try {
    return symphonyIntelligentFlowSelectionResponseSchema.parse(value);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony intelligent-flow selection response: ${String(error)}`,
      { cause: error }
    );
  }
}

export function createSymphonyIntelligentFlowRuntimeSupport(
  value: SymphonyIntelligentFlowRuntimeSupport
): SymphonyIntelligentFlowRuntimeSupport {
  return symphonyIntelligentFlowRuntimeSupportSchema.parse(value);
}

export function readSymphonyIntelligentFlowRuntimeSupport(
  value: unknown
): SymphonyIntelligentFlowRuntimeSupport {
  try {
    return symphonyIntelligentFlowRuntimeSupportSchema.parse(value);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony intelligent-flow runtime support: ${String(error)}`,
      { cause: error }
    );
  }
}

export const symphonyIntelligentFlowDefaultModuleDefinitions = Object.freeze([
  createSymphonyIntelligentFlowModuleDefinition({
    id: "intake.review",
    phase: "intaking",
    summary: "Review the ticket and derive whether execution can start.",
    description:
      "Evaluates freeform ticket detail before execution, persists the execution contract when the ticket is strong enough, and otherwise requests clarification or fails invalid directives.",
    executionKind: "system",
    executionContractRequirement: "missing",
    enabledByDefault: true,
    supportedModelProfileIds: [],
    producesEvidenceIds: [],
    requiresEvidenceIds: [],
    requiredRuntimeSupportFlags: [],
    allowedLifecycleStates: ["queued", "claimed", "active"],
    allowedOutcomeKinds: ["completed", "clarification_requested", "failed"],
    requiresNoPendingClarification: false,
    canRunWhenBlocked: false
  }),
  createSymphonyIntelligentFlowModuleDefinition({
    id: "implement.spec",
    phase: "implementing",
    summary: "Implement the requested ticket slice.",
    description:
      "Produces the canonical change set for the current work epoch.",
    executionKind: "agent",
    executionContractRequirement: "persisted",
    enabledByDefault: true,
    supportedModelProfileIds: ["builder_fast", "builder_deep"],
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
  }),
  createSymphonyIntelligentFlowModuleDefinition({
    id: "critic.code_review",
    phase: "verifying",
    summary: "Review the implementation for correctness and regressions.",
    description:
      "Produces structured code-review evidence for the current change set.",
    executionKind: "agent",
    executionContractRequirement: "persisted",
    enabledByDefault: true,
    supportedModelProfileIds: ["critic_strict"],
    producesEvidenceIds: ["code_review_report"],
    requiresEvidenceIds: ["change_set"],
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
  }),
  createSymphonyIntelligentFlowModuleDefinition({
    id: "critic.adversarial_tests",
    phase: "verifying",
    summary: "Challenge the implementation with adversarial verification.",
    description:
      "Produces hostile and edge-case verification evidence for backend-oriented changes.",
    executionKind: "agent",
    executionContractRequirement: "persisted",
    enabledByDefault: true,
    supportedModelProfileIds: ["critic_adversarial"],
    producesEvidenceIds: ["adversarial_test_report"],
    requiresEvidenceIds: ["change_set"],
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
  }),
  createSymphonyIntelligentFlowModuleDefinition({
    id: "critic.browser_test",
    phase: "verifying",
    summary: "Exercise the change through browser verification.",
    description:
      "Produces browser evidence once the execution substrate supports it.",
    executionKind: "agent",
    executionContractRequirement: "persisted",
    enabledByDefault: false,
    supportedModelProfileIds: ["critic_browser"],
    producesEvidenceIds: ["browser_test_report"],
    requiresEvidenceIds: ["change_set"],
    requiredRuntimeSupportFlags: ["browser_automation"],
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
  }),
  createSymphonyIntelligentFlowModuleDefinition({
    id: "blocked.report",
    phase: "reporting",
    summary: "Record and project a durable blocked outcome.",
    description:
      "Explains why forward progress cannot continue and moves the workflow into blocked handling.",
    executionKind: "system",
    executionContractRequirement: "persisted",
    enabledByDefault: true,
    supportedModelProfileIds: [],
    producesEvidenceIds: [],
    requiresEvidenceIds: [],
    requiredRuntimeSupportFlags: [],
    allowedLifecycleStates: ["active", "awaiting_input"],
    allowedOutcomeKinds: ["blocked"],
    requiresNoPendingClarification: false,
    canRunWhenBlocked: false
  })
] satisfies ReadonlyArray<SymphonyIntelligentFlowModuleDefinition>);

export function listSymphonyIntelligentFlowDefaultModuleDefinitions(): ReadonlyArray<
  SymphonyIntelligentFlowModuleDefinition
> {
  return symphonyIntelligentFlowDefaultModuleDefinitions;
}

export const symphonyIntelligentFlowDefaultRuntimeSupport = Object.freeze(
  createSymphonyIntelligentFlowRuntimeSupport({
    browser_automation: false
  })
);

export function isSymphonyIntelligentFlowModuleRuntimeSupported(
  module: Pick<SymphonyIntelligentFlowModuleDefinition, "requiredRuntimeSupportFlags">,
  runtimeSupport: SymphonyIntelligentFlowRuntimeSupport
): boolean {
  return module.requiredRuntimeSupportFlags.every((flagId) => runtimeSupport[flagId]);
}

export function supportsIntelligentFlowModelProfile(
  module: Pick<
    SymphonyIntelligentFlowModuleDefinition,
    "executionKind" | "supportedModelProfileIds"
  >,
  profileId: SymphonyCapabilityModelProfileId
): boolean {
  return (
    module.executionKind === "agent" &&
    module.supportedModelProfileIds.includes(profileId)
  );
}
