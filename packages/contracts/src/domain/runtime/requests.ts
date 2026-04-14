import { z } from "zod";
import { nonEmptyStringSchema } from "../../core/shared.js";

export const symphonyRuntimeIssuePathSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema
});
export const symphonyRuntimeWorkflowPathSchema = z.strictObject({
  workflowId: nonEmptyStringSchema
});

export const symphonyRuntimeRefreshRequestSchema = z.strictObject({});
export const symphonyRuntimeLogsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().positive().optional(),
  repo: nonEmptyStringSchema.optional(),
  issueIdentifier: nonEmptyStringSchema.optional()
});
export const symphonyRuntimeWorkflowObservabilityQuerySchema = z.strictObject({
  historyLimit: z.coerce.number().int().positive().optional(),
  decisionLimit: z.coerce.number().int().positive().optional()
});
export const symphonyRuntimeWorkflowComparisonQuerySchema = z
  .strictObject({
    presetIds: z.array(nonEmptyStringSchema).nonempty().optional()
  })
  .superRefine((input, context) => {
    if (!input.presetIds) {
      return;
    }

    const seenPresetIds = new Set<string>();

    for (const presetId of input.presetIds) {
      if (seenPresetIds.has(presetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["presetIds"],
          message: `Duplicate workflow comparison preset id: ${presetId}.`
        });
        return;
      }

      seenPresetIds.add(presetId);
    }
  });
export const symphonyRuntimeTrackerStateObservationRequestSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema
});
export const symphonyRuntimeClarificationAnswerRequestSchema = z.strictObject({
  requestId: nonEmptyStringSchema,
  answers: z.record(nonEmptyStringSchema, nonEmptyStringSchema).refine(
    (answers) => Object.keys(answers).length > 0,
    {
      message: "At least one clarification answer is required."
    }
  )
});

export type SymphonyRuntimeIssuePath = z.infer<typeof symphonyRuntimeIssuePathSchema>;
export type SymphonyRuntimeWorkflowPath = z.infer<
  typeof symphonyRuntimeWorkflowPathSchema
>;
export type SymphonyRuntimeRefreshRequest = z.infer<
  typeof symphonyRuntimeRefreshRequestSchema
>;
export type SymphonyRuntimeLogsQuery = z.infer<
  typeof symphonyRuntimeLogsQuerySchema
>;
export type SymphonyRuntimeWorkflowObservabilityQuery = z.infer<
  typeof symphonyRuntimeWorkflowObservabilityQuerySchema
>;
export type SymphonyRuntimeWorkflowComparisonQuery = z.infer<
  typeof symphonyRuntimeWorkflowComparisonQuerySchema
>;
export type SymphonyRuntimeTrackerStateObservationRequest = z.infer<
  typeof symphonyRuntimeTrackerStateObservationRequestSchema
>;
export type SymphonyRuntimeClarificationAnswerRequest = z.infer<
  typeof symphonyRuntimeClarificationAnswerRequestSchema
>;
