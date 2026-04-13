import { z } from "zod";
import type { WorkflowCommand, WorkflowSignal } from "./types/index.js";
import type {
  WorkflowCapabilityExecutionCommand,
  WorkflowCapabilityExecutionCommandPayload,
  WorkflowCapabilityDefinition,
  WorkflowRoutingDirectives,
  WorkflowTicketExecutionContract
} from "./types/index.js";
import { workflowSignalSchema } from "./types/schema.js";

const workflowTimestampSchema = z.string().datetime({ offset: true });
const workflowRequiredTextSchema = z.string().trim().min(1);
const workflowNullableTextSchema = workflowRequiredTextSchema.nullable();
const workflowPayloadSchema = z.record(z.string(), z.unknown()).nullable();

const workflowCommandSchema = z
  .object({
    id: workflowRequiredTextSchema,
    kind: workflowRequiredTextSchema,
    dedupeKey: workflowNullableTextSchema,
    payload: workflowPayloadSchema
  })
  .strict();

const symphonyCapabilityPhases = [
  "queued",
  "implementing",
  "verifying",
  "waiting_input",
  "blocked",
  "complete"
] as const;

const symphonyCapabilityIds = [
  "implement.spec",
  "critic.code_review",
  "critic.adversarial_tests",
  "critic.browser_test"
] as const;

const symphonyCapabilityEvidenceIds = [
  "change_set",
  "code_review_report",
  "adversarial_test_report",
  "browser_test_report"
] as const;

const symphonyCapabilityModelProfileIds = [
  "builder_fast",
  "builder_deep",
  "critic_strict",
  "critic_adversarial",
  "critic_browser"
] as const;

const symphonyCapabilityCompletionModes = [
  "manual",
  "auto"
] as const;

const symphonyCapabilityClarificationModes = [
  "required",
  "best_effort"
] as const;

const symphonyCapabilityReviewStrictnesses = [
  "standard",
  "strict",
  "adversarial"
] as const;

const symphonyCapabilityMergePolicies = [
  "manual",
  "auto_merge"
] as const;

export type SymphonyCapabilityPhase = (typeof symphonyCapabilityPhases)[number];
export type SymphonyCapabilityId = (typeof symphonyCapabilityIds)[number];
export type SymphonyCapabilityEvidenceId =
  (typeof symphonyCapabilityEvidenceIds)[number];
export type SymphonyCapabilityModelProfileId =
  (typeof symphonyCapabilityModelProfileIds)[number];
export type SymphonyCapabilityCompletionMode =
  (typeof symphonyCapabilityCompletionModes)[number];
export type SymphonyCapabilityClarificationMode =
  (typeof symphonyCapabilityClarificationModes)[number];
export type SymphonyCapabilityReviewStrictness =
  (typeof symphonyCapabilityReviewStrictnesses)[number];
export type SymphonyCapabilityMergePolicy =
  (typeof symphonyCapabilityMergePolicies)[number];

const symphonyCapabilityPhaseSchema = z.enum(symphonyCapabilityPhases);
const symphonyCapabilityIdSchema = z.enum(symphonyCapabilityIds);
const symphonyCapabilityEvidenceIdSchema = z.enum(
  symphonyCapabilityEvidenceIds
);
const symphonyCapabilityModelProfileIdSchema = z.enum(
  symphonyCapabilityModelProfileIds
);
const symphonyCapabilityCompletionModeSchema = z.enum(
  symphonyCapabilityCompletionModes
);
const symphonyCapabilityClarificationModeSchema = z.enum(
  symphonyCapabilityClarificationModes
);
const symphonyCapabilityReviewStrictnessSchema = z.enum(
  symphonyCapabilityReviewStrictnesses
);
const symphonyCapabilityMergePolicySchema = z.enum(
  symphonyCapabilityMergePolicies
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

const symphonyCapabilityCompletionPolicySchema = z
  .object({
    mode: symphonyCapabilityCompletionModeSchema
  })
  .strict();

const symphonyCapabilityClarificationPolicySchema = z
  .object({
    mode: symphonyCapabilityClarificationModeSchema
  })
  .strict();

const symphonyCapabilityRoutingDirectivesSchema = z
  .object({
    requiredCapabilityIds: createUniqueEnumArraySchema(
      symphonyCapabilityIds,
      "required capability id"
    ),
    preferredCapabilityIds: createUniqueEnumArraySchema(
      symphonyCapabilityIds,
      "preferred capability id"
    ),
    forbiddenCapabilityIds: createUniqueEnumArraySchema(
      symphonyCapabilityIds,
      "forbidden capability id"
    ),
    requiredEvidenceIds: createUniqueEnumArraySchema(
      symphonyCapabilityEvidenceIds,
      "required evidence id"
    ),
    allowedModelProfileIds: createUniqueEnumArraySchema(
      symphonyCapabilityModelProfileIds,
      "allowed model profile id"
    ),
    completionPolicy: symphonyCapabilityCompletionPolicySchema,
    clarificationPolicy: symphonyCapabilityClarificationPolicySchema,
    reviewStrictness: symphonyCapabilityReviewStrictnessSchema,
    maxRetryCount: z.number().int().nonnegative()
  })
  .strict();

const symphonyCapabilityDefinitionSchema = z
  .object({
    id: symphonyCapabilityIdSchema,
    phase: symphonyCapabilityPhaseSchema,
    description: workflowRequiredTextSchema,
    supportedModelProfileIds: createUniqueEnumArraySchema(
      symphonyCapabilityModelProfileIds,
      "supported model profile id"
    ).nonempty(),
    producesEvidenceIds: createUniqueEnumArraySchema(
      symphonyCapabilityEvidenceIds,
      "produced evidence id"
    ),
    enabledByDefault: z.boolean()
  })
  .strict();

const symphonyModelProfileDefinitionSchema = z
  .object({
    id: symphonyCapabilityModelProfileIdSchema,
    label: workflowRequiredTextSchema,
    description: workflowRequiredTextSchema.nullable()
  })
  .strict();

const symphonyTicketExecutionContractSchema = z
  .object({
    contractId: workflowRequiredTextSchema,
    workflowId: workflowRequiredTextSchema,
    issueIdentifier: workflowRequiredTextSchema,
    repositoryKey: workflowRequiredTextSchema,
    summary: workflowRequiredTextSchema,
    objective: workflowRequiredTextSchema,
    doneDefinition: workflowRequiredTextSchema,
    mergePolicy: symphonyCapabilityMergePolicySchema,
    routingDirectives: symphonyCapabilityRoutingDirectivesSchema,
    createdAt: workflowTimestampSchema,
    updatedAt: workflowTimestampSchema
  })
  .strict();

const symphonyCapabilityExecutionCommandPayloadSchema = z
  .object({
    workflowId: workflowRequiredTextSchema,
    capabilityId: symphonyCapabilityIdSchema,
    modelProfileId: symphonyCapabilityModelProfileIdSchema,
    contract: symphonyTicketExecutionContractSchema,
    executionInput: z.record(z.string(), z.unknown()).nullable()
  })
  .strict();

const symphonyCapabilityExecutionCommandSchema = workflowCommandSchema
  .extend({
    kind: z.literal("capability.execute"),
    payload: symphonyCapabilityExecutionCommandPayloadSchema
  })
  .strict();

const symphonyCapabilityExecutionSignalSourceSchema = z.union([
  z.literal("runtime"),
  z.literal("router"),
  z.literal("operator")
]);

const symphonyCapabilityReviewSignalSourceSchema = z.union([
  z.literal("runtime"),
  z.literal("review"),
  z.literal("operator")
]);

const symphonyCapabilityClarificationSignalSourceSchema = z.union([
  z.literal("runtime"),
  z.literal("router"),
  z.literal("operator")
]);

const symphonyCapabilityClarificationAnsweredSourceSchema = z.union([
  z.literal("operator"),
  z.literal("router")
]);

const symphonyCapabilityCompletionGateSignalSourceSchema = z.union([
  z.literal("router"),
  z.literal("operator")
]);

const symphonyCapabilityCompletionReadinessSchema = z.enum([
  "not_ready",
  "ready_for_manual_completion",
  "ready_for_auto_completion"
]);

const symphonyCapabilityEvidenceArtifactReferenceSchema = z
  .object({
    label: workflowRequiredTextSchema,
    uri: workflowNullableTextSchema
  })
  .strict();

const symphonyCapabilityEvidenceRecordSchema = z
  .object({
    evidenceId: symphonyCapabilityEvidenceIdSchema,
    summary: workflowRequiredTextSchema,
    artifacts: z.array(symphonyCapabilityEvidenceArtifactReferenceSchema)
  })
  .strict();

const symphonyCapabilityExecutionIdentityPayloadSchema = z
  .object({
    workflowId: workflowRequiredTextSchema,
    executionId: workflowRequiredTextSchema,
    capabilityId: symphonyCapabilityIdSchema,
    modelProfileId: symphonyCapabilityModelProfileIdSchema,
    workEpoch: z.number().int().nonnegative(),
    attempt: z.number().int().positive(),
    summary: workflowRequiredTextSchema
  })
  .strict();

const symphonyCapabilityStartedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("capability.started"),
    source: symphonyCapabilityExecutionSignalSourceSchema,
    payload: symphonyCapabilityExecutionIdentityPayloadSchema
  })
  .strict();

const symphonyCapabilityCompletedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("capability.completed"),
    source: symphonyCapabilityExecutionSignalSourceSchema,
    payload: symphonyCapabilityExecutionIdentityPayloadSchema
      .extend({
        evidenceProduced: z.array(symphonyCapabilityEvidenceRecordSchema)
      })
      .strict()
  })
  .strict();

const symphonyCapabilityChangesRequestedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("capability.changes_requested"),
    source: symphonyCapabilityReviewSignalSourceSchema,
    payload: symphonyCapabilityExecutionIdentityPayloadSchema
      .extend({
        findings: z.array(workflowRequiredTextSchema).min(1)
      })
      .strict()
  })
  .strict();

const symphonyCapabilityFailedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("capability.failed"),
    source: symphonyCapabilityExecutionSignalSourceSchema,
    payload: symphonyCapabilityExecutionIdentityPayloadSchema
      .extend({
        retryable: z.boolean(),
        reasonCode: workflowRequiredTextSchema,
        failureKind: workflowRequiredTextSchema
      })
      .strict()
  })
  .strict();

const symphonyCapabilityBlockedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("capability.blocked"),
    source: symphonyCapabilityExecutionSignalSourceSchema,
    payload: symphonyCapabilityExecutionIdentityPayloadSchema
      .extend({
        reasonCode: workflowRequiredTextSchema
      })
      .strict()
  })
  .strict();

const symphonyCapabilityClarificationQuestionSchema = z
  .object({
    id: workflowRequiredTextSchema,
    prompt: workflowRequiredTextSchema,
    context: workflowNullableTextSchema
  })
  .strict();

const symphonyWorkflowClarificationRequestedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("workflow.clarification_requested"),
    source: symphonyCapabilityClarificationSignalSourceSchema,
    payload: z
      .object({
        workflowId: workflowRequiredTextSchema,
        requestId: workflowRequiredTextSchema,
        raisedByCapabilityId: symphonyCapabilityIdSchema.nullable(),
        workEpoch: z.number().int().nonnegative(),
        summary: workflowRequiredTextSchema,
        questions: z.array(symphonyCapabilityClarificationQuestionSchema).min(1)
      })
      .strict()
  })
  .strict();

const symphonyWorkflowClarificationAnsweredSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("workflow.clarification_answered"),
    source: symphonyCapabilityClarificationAnsweredSourceSchema,
    payload: z
      .object({
        workflowId: workflowRequiredTextSchema,
        requestId: workflowRequiredTextSchema,
        answeredAt: workflowTimestampSchema,
        answers: z.record(z.string(), z.unknown())
      })
      .strict()
  })
  .strict();

const symphonyWorkflowCompletionGateEvaluatedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("workflow.completion_gate_evaluated"),
    source: symphonyCapabilityCompletionGateSignalSourceSchema,
    payload: z
      .object({
        workflowId: workflowRequiredTextSchema,
        workEpoch: z.number().int().nonnegative(),
        result: symphonyCapabilityCompletionReadinessSchema,
        satisfiedEvidenceIds: createUniqueEnumArraySchema(
          symphonyCapabilityEvidenceIds,
          "satisfied evidence id"
        ),
        missingEvidenceIds: createUniqueEnumArraySchema(
          symphonyCapabilityEvidenceIds,
          "missing evidence id"
        ),
        reasons: z.array(workflowRequiredTextSchema)
      })
      .strict()
  })
  .strict();

export type SymphonyWorkflowRoutingDirectives = WorkflowRoutingDirectives<
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
>;

export type SymphonyWorkflowTicketExecutionContract =
  WorkflowTicketExecutionContract<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;

export type SymphonyWorkflowCapabilityDefinition = WorkflowCapabilityDefinition<
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
>;

export type SymphonyWorkflowCapabilityExecutionCommandPayload =
  WorkflowCapabilityExecutionCommandPayload<
    SymphonyWorkflowTicketExecutionContract,
    SymphonyCapabilityId,
    SymphonyCapabilityModelProfileId
  >;

export type SymphonyWorkflowCapabilityExecutionCommand =
  WorkflowCapabilityExecutionCommand<
    SymphonyWorkflowTicketExecutionContract,
    SymphonyCapabilityId,
    SymphonyCapabilityModelProfileId
  >;

export type SymphonyWorkflowCapabilityStartedSignal = WorkflowSignal<
  "capability.started",
  z.infer<typeof symphonyCapabilityExecutionIdentityPayloadSchema>
>;

export type SymphonyWorkflowCapabilityCompletedSignal = WorkflowSignal<
  "capability.completed",
  z.infer<typeof symphonyCapabilityCompletedSignalSchema>["payload"]
>;

export type SymphonyWorkflowCapabilityChangesRequestedSignal = WorkflowSignal<
  "capability.changes_requested",
  z.infer<typeof symphonyCapabilityChangesRequestedSignalSchema>["payload"]
>;

export type SymphonyWorkflowCapabilityFailedSignal = WorkflowSignal<
  "capability.failed",
  z.infer<typeof symphonyCapabilityFailedSignalSchema>["payload"]
>;

export type SymphonyWorkflowCapabilityBlockedSignal = WorkflowSignal<
  "capability.blocked",
  z.infer<typeof symphonyCapabilityBlockedSignalSchema>["payload"]
>;

export type SymphonyWorkflowClarificationRequestedSignal = WorkflowSignal<
  "workflow.clarification_requested",
  z.infer<typeof symphonyWorkflowClarificationRequestedSignalSchema>["payload"]
>;

export type SymphonyWorkflowClarificationAnsweredSignal = WorkflowSignal<
  "workflow.clarification_answered",
  z.infer<typeof symphonyWorkflowClarificationAnsweredSignalSchema>["payload"]
>;

export type SymphonyWorkflowCompletionGateEvaluatedSignal = WorkflowSignal<
  "workflow.completion_gate_evaluated",
  z.infer<typeof symphonyWorkflowCompletionGateEvaluatedSignalSchema>["payload"]
>;

export function createSymphonyTicketExecutionContract(input: {
  contractId: string;
  workflowId: string;
  issueIdentifier: string;
  repositoryKey: string;
  summary: string;
  objective: string;
  doneDefinition: string;
  mergePolicy: SymphonyCapabilityMergePolicy;
  routingDirectives: SymphonyWorkflowRoutingDirectives;
  createdAt: string;
  updatedAt: string;
}): SymphonyWorkflowTicketExecutionContract {
  return symphonyTicketExecutionContractSchema.parse(input);
}

export function readSymphonyTicketExecutionContract(
  value: unknown
): SymphonyWorkflowTicketExecutionContract {
  try {
    return symphonyTicketExecutionContractSchema.parse(value);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony capability ticket execution contract: ${String(error)}`,
      {
        cause: error
      }
    );
  }
}

export function createSymphonyCapabilityExecutionCommand(input: {
  id: string;
  dedupeKey: string | null;
  workflowId: string;
  capabilityId: SymphonyCapabilityId;
  modelProfileId: SymphonyCapabilityModelProfileId;
  contract: SymphonyWorkflowTicketExecutionContract;
  executionInput: Record<string, unknown> | null;
}): SymphonyWorkflowCapabilityExecutionCommand {
  return symphonyCapabilityExecutionCommandSchema.parse({
    id: input.id,
    kind: "capability.execute",
    dedupeKey: input.dedupeKey,
    payload: {
      workflowId: input.workflowId,
      capabilityId: input.capabilityId,
      modelProfileId: input.modelProfileId,
      contract: input.contract,
      executionInput: input.executionInput
    }
  });
}

export function createSymphonyCapabilityStartedSignal(input: {
  id: string;
  occurredAt: string;
  source: "runtime" | "router" | "operator";
  workflowId: string;
  executionId: string;
  capabilityId: SymphonyCapabilityId;
  modelProfileId: SymphonyCapabilityModelProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyWorkflowCapabilityStartedSignal {
  return symphonyCapabilityStartedSignalSchema.parse({
    id: input.id,
    type: "capability.started",
    source: input.source,
    occurredAt: input.occurredAt,
    payload: {
      workflowId: input.workflowId,
      executionId: input.executionId,
      capabilityId: input.capabilityId,
      modelProfileId: input.modelProfileId,
      workEpoch: input.workEpoch,
      attempt: input.attempt,
      summary: input.summary
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCapabilityCompletedSignal(input: {
  id: string;
  occurredAt: string;
  source: "runtime" | "router" | "operator";
  workflowId: string;
  executionId: string;
  capabilityId: SymphonyCapabilityId;
  modelProfileId: SymphonyCapabilityModelProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  evidenceProduced: z.infer<typeof symphonyCapabilityEvidenceRecordSchema>[];
  causationId: string | null;
  correlationId: string | null;
}): SymphonyWorkflowCapabilityCompletedSignal {
  return symphonyCapabilityCompletedSignalSchema.parse({
    id: input.id,
    type: "capability.completed",
    source: input.source,
    occurredAt: input.occurredAt,
    payload: {
      workflowId: input.workflowId,
      executionId: input.executionId,
      capabilityId: input.capabilityId,
      modelProfileId: input.modelProfileId,
      workEpoch: input.workEpoch,
      attempt: input.attempt,
      summary: input.summary,
      evidenceProduced: input.evidenceProduced
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCapabilityChangesRequestedSignal(input: {
  id: string;
  occurredAt: string;
  source: "runtime" | "review" | "operator";
  workflowId: string;
  executionId: string;
  capabilityId: SymphonyCapabilityId;
  modelProfileId: SymphonyCapabilityModelProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  findings: string[];
  causationId: string | null;
  correlationId: string | null;
}): SymphonyWorkflowCapabilityChangesRequestedSignal {
  return symphonyCapabilityChangesRequestedSignalSchema.parse({
    id: input.id,
    type: "capability.changes_requested",
    source: input.source,
    occurredAt: input.occurredAt,
    payload: {
      workflowId: input.workflowId,
      executionId: input.executionId,
      capabilityId: input.capabilityId,
      modelProfileId: input.modelProfileId,
      workEpoch: input.workEpoch,
      attempt: input.attempt,
      summary: input.summary,
      findings: input.findings
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCapabilityFailedSignal(input: {
  id: string;
  occurredAt: string;
  source: "runtime" | "router" | "operator";
  workflowId: string;
  executionId: string;
  capabilityId: SymphonyCapabilityId;
  modelProfileId: SymphonyCapabilityModelProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  retryable: boolean;
  reasonCode: string;
  failureKind: string;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyWorkflowCapabilityFailedSignal {
  return symphonyCapabilityFailedSignalSchema.parse({
    id: input.id,
    type: "capability.failed",
    source: input.source,
    occurredAt: input.occurredAt,
    payload: {
      workflowId: input.workflowId,
      executionId: input.executionId,
      capabilityId: input.capabilityId,
      modelProfileId: input.modelProfileId,
      workEpoch: input.workEpoch,
      attempt: input.attempt,
      summary: input.summary,
      retryable: input.retryable,
      reasonCode: input.reasonCode,
      failureKind: input.failureKind
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCapabilityBlockedSignal(input: {
  id: string;
  occurredAt: string;
  source: "runtime" | "router" | "operator";
  workflowId: string;
  executionId: string;
  capabilityId: SymphonyCapabilityId;
  modelProfileId: SymphonyCapabilityModelProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  reasonCode: string;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyWorkflowCapabilityBlockedSignal {
  return symphonyCapabilityBlockedSignalSchema.parse({
    id: input.id,
    type: "capability.blocked",
    source: input.source,
    occurredAt: input.occurredAt,
    payload: {
      workflowId: input.workflowId,
      executionId: input.executionId,
      capabilityId: input.capabilityId,
      modelProfileId: input.modelProfileId,
      workEpoch: input.workEpoch,
      attempt: input.attempt,
      summary: input.summary,
      reasonCode: input.reasonCode
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyWorkflowClarificationRequestedSignal(input: {
  id: string;
  occurredAt: string;
  source: "runtime" | "router" | "operator";
  workflowId: string;
  requestId: string;
  raisedByCapabilityId: SymphonyCapabilityId | null;
  workEpoch: number;
  summary: string;
  questions: z.infer<typeof symphonyCapabilityClarificationQuestionSchema>[];
  causationId: string | null;
  correlationId: string | null;
}): SymphonyWorkflowClarificationRequestedSignal {
  return symphonyWorkflowClarificationRequestedSignalSchema.parse({
    id: input.id,
    type: "workflow.clarification_requested",
    source: input.source,
    occurredAt: input.occurredAt,
    payload: {
      workflowId: input.workflowId,
      requestId: input.requestId,
      raisedByCapabilityId: input.raisedByCapabilityId,
      workEpoch: input.workEpoch,
      summary: input.summary,
      questions: input.questions
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyWorkflowClarificationAnsweredSignal(input: {
  id: string;
  occurredAt: string;
  source: "operator" | "router";
  workflowId: string;
  requestId: string;
  answeredAt: string;
  answers: Record<string, unknown>;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyWorkflowClarificationAnsweredSignal {
  return symphonyWorkflowClarificationAnsweredSignalSchema.parse({
    id: input.id,
    type: "workflow.clarification_answered",
    source: input.source,
    occurredAt: input.occurredAt,
    payload: {
      workflowId: input.workflowId,
      requestId: input.requestId,
      answeredAt: input.answeredAt,
      answers: input.answers
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyWorkflowCompletionGateEvaluatedSignal(input: {
  id: string;
  occurredAt: string;
  source: "router" | "operator";
  workflowId: string;
  workEpoch: number;
  result: "not_ready" | "ready_for_manual_completion" | "ready_for_auto_completion";
  satisfiedEvidenceIds: SymphonyCapabilityEvidenceId[];
  missingEvidenceIds: SymphonyCapabilityEvidenceId[];
  reasons: string[];
  causationId: string | null;
  correlationId: string | null;
}): SymphonyWorkflowCompletionGateEvaluatedSignal {
  return symphonyWorkflowCompletionGateEvaluatedSignalSchema.parse({
    id: input.id,
    type: "workflow.completion_gate_evaluated",
    source: input.source,
    occurredAt: input.occurredAt,
    payload: {
      workflowId: input.workflowId,
      workEpoch: input.workEpoch,
      result: input.result,
      satisfiedEvidenceIds: input.satisfiedEvidenceIds,
      missingEvidenceIds: input.missingEvidenceIds,
      reasons: input.reasons
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function readSymphonyCapabilityExecutionCommand(
  command: WorkflowCommand
): SymphonyWorkflowCapabilityExecutionCommand | null {
  if (command.kind !== "capability.execute") {
    return null;
  }

  try {
    return symphonyCapabilityExecutionCommandSchema.parse(command);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony capability capability.execute command: ${String(error)}`,
      {
        cause: error
      }
    );
  }
}

export function readSymphonyCapabilityStartedSignal(
  signal: WorkflowSignal
): SymphonyWorkflowCapabilityStartedSignal | null {
  return readSignal({
    signal,
    expectedType: "capability.started",
    schema: symphonyCapabilityStartedSignalSchema,
    label: "capability.started"
  });
}

export function readSymphonyCapabilityCompletedSignal(
  signal: WorkflowSignal
): SymphonyWorkflowCapabilityCompletedSignal | null {
  return readSignal({
    signal,
    expectedType: "capability.completed",
    schema: symphonyCapabilityCompletedSignalSchema,
    label: "capability.completed"
  });
}

export function readSymphonyCapabilityChangesRequestedSignal(
  signal: WorkflowSignal
): SymphonyWorkflowCapabilityChangesRequestedSignal | null {
  return readSignal({
    signal,
    expectedType: "capability.changes_requested",
    schema: symphonyCapabilityChangesRequestedSignalSchema,
    label: "capability.changes_requested"
  });
}

export function readSymphonyCapabilityFailedSignal(
  signal: WorkflowSignal
): SymphonyWorkflowCapabilityFailedSignal | null {
  return readSignal({
    signal,
    expectedType: "capability.failed",
    schema: symphonyCapabilityFailedSignalSchema,
    label: "capability.failed"
  });
}

export function readSymphonyCapabilityBlockedSignal(
  signal: WorkflowSignal
): SymphonyWorkflowCapabilityBlockedSignal | null {
  return readSignal({
    signal,
    expectedType: "capability.blocked",
    schema: symphonyCapabilityBlockedSignalSchema,
    label: "capability.blocked"
  });
}

export function readSymphonyWorkflowClarificationRequestedSignal(
  signal: WorkflowSignal
): SymphonyWorkflowClarificationRequestedSignal | null {
  return readSignal({
    signal,
    expectedType: "workflow.clarification_requested",
    schema: symphonyWorkflowClarificationRequestedSignalSchema,
    label: "workflow.clarification_requested"
  });
}

export function readSymphonyWorkflowClarificationAnsweredSignal(
  signal: WorkflowSignal
): SymphonyWorkflowClarificationAnsweredSignal | null {
  return readSignal({
    signal,
    expectedType: "workflow.clarification_answered",
    schema: symphonyWorkflowClarificationAnsweredSignalSchema,
    label: "workflow.clarification_answered"
  });
}

export function readSymphonyWorkflowCompletionGateEvaluatedSignal(
  signal: WorkflowSignal
): SymphonyWorkflowCompletionGateEvaluatedSignal | null {
  return readSignal({
    signal,
    expectedType: "workflow.completion_gate_evaluated",
    schema: symphonyWorkflowCompletionGateEvaluatedSignalSchema,
    label: "workflow.completion_gate_evaluated"
  });
}

export function parseSymphonyCapabilityPhase(value: unknown): SymphonyCapabilityPhase {
  return parseSymphonyEnumValue(
    value,
    symphonyCapabilityPhaseSchema,
    "workflow capability phase"
  );
}

export function parseSymphonyCapabilityId(value: unknown): SymphonyCapabilityId {
  return parseSymphonyEnumValue(
    value,
    symphonyCapabilityIdSchema,
    "workflow capability id"
  );
}

export function parseSymphonyCapabilityEvidenceId(
  value: unknown
): SymphonyCapabilityEvidenceId {
  return parseSymphonyEnumValue(
    value,
    symphonyCapabilityEvidenceIdSchema,
    "workflow evidence id"
  );
}

export function parseSymphonyCapabilityModelProfileId(
  value: unknown
): SymphonyCapabilityModelProfileId {
  return parseSymphonyEnumValue(
    value,
    symphonyCapabilityModelProfileIdSchema,
    "workflow model profile id"
  );
}

function parseSymphonyEnumValue<TValue>(
  value: unknown,
  schema: z.ZodType<TValue>,
  label: string
): TValue {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new TypeError(`Invalid Symphony capability ${label}: ${String(error)}`, {
      cause: error
    });
  }
}

function readSignal<TSignal extends WorkflowSignal>(input: {
  signal: WorkflowSignal;
  expectedType: TSignal["type"];
  schema: z.ZodType<TSignal>;
  label: string;
}): TSignal | null {
  if (input.signal.type !== input.expectedType) {
    return null;
  }

  try {
    return input.schema.parse(input.signal);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony capability ${input.label} signal: ${String(error)}`,
      {
        cause: error
      }
    );
  }
}

export {
  symphonyCapabilityBlockedSignalSchema,
  symphonyCapabilityChangesRequestedSignalSchema,
  symphonyCapabilityClarificationQuestionSchema,
  symphonyCapabilityClarificationModeSchema,
  symphonyCapabilityCompletionModeSchema,
  symphonyCapabilityCompletionReadinessSchema,
  symphonyCapabilityCompletedSignalSchema,
  symphonyCapabilityDefinitionSchema,
  symphonyCapabilityEvidenceArtifactReferenceSchema,
  symphonyCapabilityEvidenceIdSchema,
  symphonyCapabilityEvidenceRecordSchema,
  symphonyCapabilityExecutionCommandSchema,
  symphonyCapabilityExecutionIdentityPayloadSchema,
  symphonyCapabilityFailedSignalSchema,
  symphonyCapabilityIdSchema,
  symphonyCapabilityMergePolicySchema,
  symphonyCapabilityModelProfileIdSchema,
  symphonyCapabilityPhaseSchema,
  symphonyCapabilityReviewStrictnessSchema,
  symphonyCapabilityRoutingDirectivesSchema,
  symphonyCapabilityStartedSignalSchema,
  symphonyModelProfileDefinitionSchema,
  symphonyTicketExecutionContractSchema,
  symphonyWorkflowClarificationAnsweredSignalSchema,
  symphonyWorkflowClarificationRequestedSignalSchema,
  symphonyWorkflowCompletionGateEvaluatedSignalSchema
};
