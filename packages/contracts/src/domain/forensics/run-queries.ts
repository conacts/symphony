import { z } from "zod";
import {
  isoTimestampSchema,
  positiveLimitSchema
} from "../../core/shared.js";

const optionalFilterSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().min(1).optional());

export const symphonyForensicsRunsQuerySchema = z.strictObject({
  limit: positiveLimitSchema.optional(),
  issueIdentifier: optionalFilterSchema,
  startedAfter: isoTimestampSchema.optional(),
  startedBefore: isoTimestampSchema.optional(),
  outcome: optionalFilterSchema,
  errorClass: optionalFilterSchema,
  problemOnly: z.boolean().optional()
});

export type SymphonyForensicsRunsQuery = z.infer<typeof symphonyForensicsRunsQuerySchema>;
