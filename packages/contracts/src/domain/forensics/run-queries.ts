import { z } from "zod";
import {
  isoTimestampSchema,
  positiveLimitSchema
} from "../../core/shared.js";
import { symphonyForensicsRunOutcomeSchema } from "./requests.js";

const optionalFilterSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().min(1).optional());
const optionalOutcomeFilterSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, symphonyForensicsRunOutcomeSchema.optional());

export const symphonyForensicsRunsQuerySchema = z.strictObject({
  limit: positiveLimitSchema.optional(),
  repo: optionalFilterSchema,
  trackerIssueKey: optionalFilterSchema,
  startedAfter: isoTimestampSchema.optional(),
  startedBefore: isoTimestampSchema.optional(),
  outcome: optionalOutcomeFilterSchema,
  errorClass: optionalFilterSchema,
  problemOnly: z.boolean().optional()
});

export type SymphonyForensicsRunsQuery = z.infer<typeof symphonyForensicsRunsQuerySchema>;
