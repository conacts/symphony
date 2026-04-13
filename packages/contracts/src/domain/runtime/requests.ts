import { z } from "zod";
import { nonEmptyStringSchema } from "../../core/shared.js";

export const symphonyRuntimeIssuePathSchema = z.strictObject({
  trackerIssueKey: nonEmptyStringSchema
});

export const symphonyRuntimeRefreshRequestSchema = z.strictObject({});
export const symphonyRuntimeLogsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().positive().optional(),
  repo: nonEmptyStringSchema.optional(),
  trackerIssueKey: nonEmptyStringSchema.optional()
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
  trackerIssueKey: nonEmptyStringSchema
});

export type SymphonyRuntimeIssuePath = z.infer<typeof symphonyRuntimeIssuePathSchema>;
export type SymphonyRuntimeRefreshRequest = z.infer<
  typeof symphonyRuntimeRefreshRequestSchema
>;
export type SymphonyRuntimeLogsQuery = z.infer<
  typeof symphonyRuntimeLogsQuerySchema
>;
export type SymphonyRuntimeWorkflowComparisonQuery = z.infer<
  typeof symphonyRuntimeWorkflowComparisonQuerySchema
>;
export type SymphonyRuntimeTrackerStateObservationRequest = z.infer<
  typeof symphonyRuntimeTrackerStateObservationRequestSchema
>;
