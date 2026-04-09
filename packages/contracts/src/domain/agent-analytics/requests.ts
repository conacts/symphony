import { z } from "zod";
import { nonEmptyStringSchema } from "../../core/shared.js";

export const symphonyAgentRunQuerySchema = z.strictObject({
  runId: nonEmptyStringSchema
});

export const symphonyAgentOverflowPathSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  overflowId: nonEmptyStringSchema
});

export const symphonyAgentRunTurnQuerySchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema.optional()
});

export const symphonyAgentRunTurnFilterSchema = z.strictObject({
  turnId: nonEmptyStringSchema.optional()
});

export type SymphonyAgentRunQuery = z.infer<typeof symphonyAgentRunQuerySchema>;
export type SymphonyAgentOverflowPath = z.infer<typeof symphonyAgentOverflowPathSchema>;
export type SymphonyAgentRunTurnQuery = z.infer<typeof symphonyAgentRunTurnQuerySchema>;
export type SymphonyAgentRunTurnFilter = z.infer<
  typeof symphonyAgentRunTurnFilterSchema
>;
