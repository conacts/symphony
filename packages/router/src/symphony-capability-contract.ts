import { z } from "zod";
import type { WorkflowCommand } from "./types/index.js";
import type {
  WorkflowCapabilityExecutionCommand,
  WorkflowCapabilityExecutionCommandPayload,
  WorkflowCapabilityDefinition,
  WorkflowRoutingDirectives,
  WorkflowTicketExecutionContract
} from "./types/index.js";

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

export {
  symphonyCapabilityClarificationModeSchema,
  symphonyCapabilityCompletionModeSchema,
  symphonyCapabilityDefinitionSchema,
  symphonyCapabilityEvidenceIdSchema,
  symphonyCapabilityExecutionCommandSchema,
  symphonyCapabilityIdSchema,
  symphonyCapabilityMergePolicySchema,
  symphonyCapabilityModelProfileIdSchema,
  symphonyCapabilityPhaseSchema,
  symphonyCapabilityReviewStrictnessSchema,
  symphonyCapabilityRoutingDirectivesSchema,
  symphonyModelProfileDefinitionSchema,
  symphonyTicketExecutionContractSchema
};
