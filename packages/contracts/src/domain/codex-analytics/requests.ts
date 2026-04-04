import { z } from "zod";
import { nonEmptyStringSchema } from "../../core/shared.js";

export const symphonyCodexRunQuerySchema = z.strictObject({
  runId: nonEmptyStringSchema
});

export const symphonyCodexRunTurnQuerySchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema.optional()
});

export type SymphonyCodexRunQuery = z.infer<typeof symphonyCodexRunQuerySchema>;
export type SymphonyCodexRunTurnQuery = z.infer<typeof symphonyCodexRunTurnQuerySchema>;
