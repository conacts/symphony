import { z } from "zod";
import { nonEmptyStringSchema } from "../../core/shared.js";

export const symphonyCodexRunQuerySchema = z.strictObject({
  runId: nonEmptyStringSchema
});

export const symphonyCodexRunPathSchema = symphonyCodexRunQuerySchema;

export const symphonyCodexOverflowPathSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  overflowId: nonEmptyStringSchema
});

export const symphonyCodexRunTurnQuerySchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema.optional()
});

export const symphonyCodexRunTurnFilterSchema = z.strictObject({
  turnId: nonEmptyStringSchema.optional()
});

export type SymphonyCodexRunQuery = z.infer<typeof symphonyCodexRunQuerySchema>;
export type SymphonyCodexRunPath = z.infer<typeof symphonyCodexRunPathSchema>;
export type SymphonyCodexOverflowPath = z.infer<typeof symphonyCodexOverflowPathSchema>;
export type SymphonyCodexRunTurnQuery = z.infer<typeof symphonyCodexRunTurnQuerySchema>;
export type SymphonyCodexRunTurnFilter = z.infer<
  typeof symphonyCodexRunTurnFilterSchema
>;
