import { z } from "zod";
import { nonEmptyStringSchema, positiveLimitSchema } from "../../core/shared.js";

export const symphonyForensicsIssuesQuerySchema = z.strictObject({
  limit: positiveLimitSchema
});

export const symphonyForensicsIssuePathSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema
});

export const symphonyForensicsIssueQuerySchema = z.strictObject({
  limit: positiveLimitSchema
});

export const symphonyForensicsIssueTimelineQuerySchema = z.strictObject({
  limit: positiveLimitSchema
});

export const symphonyForensicsRunPathSchema = z.strictObject({
  runId: nonEmptyStringSchema
});

export const symphonyForensicsProblemRunsQuerySchema = z.strictObject({
  limit: positiveLimitSchema,
  outcome: nonEmptyStringSchema.optional(),
  issueIdentifier: nonEmptyStringSchema.optional()
});

export type SymphonyForensicsIssuesQuery = z.infer<typeof symphonyForensicsIssuesQuerySchema>;
export type SymphonyForensicsIssuePath = z.infer<typeof symphonyForensicsIssuePathSchema>;
export type SymphonyForensicsIssueQuery = z.infer<typeof symphonyForensicsIssueQuerySchema>;
export type SymphonyForensicsIssueTimelineQuery = z.infer<
  typeof symphonyForensicsIssueTimelineQuerySchema
>;
export type SymphonyForensicsRunPath = z.infer<typeof symphonyForensicsRunPathSchema>;
export type SymphonyForensicsProblemRunsQuery = z.infer<
  typeof symphonyForensicsProblemRunsQuerySchema
>;
