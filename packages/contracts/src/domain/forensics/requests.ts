import { z } from "zod";
import {
  isoTimestampSchema,
  nonEmptyStringSchema,
  positiveLimitSchema
} from "../../core/shared.js";

const optionalFilterSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, nonEmptyStringSchema.optional());

export const symphonyForensicsIssueTimeRangeSchema = z.enum([
  "all",
  "24h",
  "7d",
  "30d",
  "custom"
]);

export const symphonyForensicsIssueSortBySchema = z.enum([
  "lastActive",
  "problemRate",
  "totalTokens",
  "retries",
  "runCount",
  "avgDuration"
]);

export const symphonyForensicsIssueSortDirectionSchema = z.enum(["asc", "desc"]);

export const symphonyForensicsIssueFlagSchema = z.enum([
  "rate_limited",
  "max_turns",
  "startup_failure",
  "no_success",
  "high_token_burn",
  "long_duration",
  "many_retries"
]);

export const symphonyForensicsIssuesQuerySchema = z.strictObject({
  limit: positiveLimitSchema.optional(),
  timeRange: symphonyForensicsIssueTimeRangeSchema.default("all"),
  startedAfter: isoTimestampSchema.optional(),
  startedBefore: isoTimestampSchema.optional(),
  outcome: optionalFilterSchema,
  errorClass: optionalFilterSchema,
  hasFlag: z.string().optional(),
  sortBy: symphonyForensicsIssueSortBySchema.default("lastActive"),
  sortDirection: symphonyForensicsIssueSortDirectionSchema.default("desc")
});

export const symphonyForensicsIssuePathSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema
});

export const symphonyForensicsIssueQuerySchema = z.strictObject({
  limit: positiveLimitSchema
});

export const symphonyForensicsIssueForensicsBundleQuerySchema =
  symphonyForensicsIssuesQuerySchema.extend({
    recentRunLimit: positiveLimitSchema.optional(),
    timelineLimit: positiveLimitSchema.optional(),
    runtimeLogLimit: positiveLimitSchema.optional()
  });

export const symphonyForensicsIssueTimelineQuerySchema = z.strictObject({
  limit: positiveLimitSchema
});

export const symphonyForensicsRunPathSchema = z.strictObject({
  runId: nonEmptyStringSchema
});

export const symphonyForensicsProblemRunsQuerySchema = z.strictObject({
  limit: positiveLimitSchema,
  outcome: optionalFilterSchema,
  issueIdentifier: optionalFilterSchema
});

export type SymphonyForensicsIssuesQuery = z.infer<typeof symphonyForensicsIssuesQuerySchema>;
export type SymphonyForensicsIssueTimeRange = z.infer<
  typeof symphonyForensicsIssueTimeRangeSchema
>;
export type SymphonyForensicsIssueSortBy = z.infer<
  typeof symphonyForensicsIssueSortBySchema
>;
export type SymphonyForensicsIssueSortDirection = z.infer<
  typeof symphonyForensicsIssueSortDirectionSchema
>;
export type SymphonyForensicsIssueFlag = z.infer<typeof symphonyForensicsIssueFlagSchema>;
export type SymphonyForensicsIssuePath = z.infer<typeof symphonyForensicsIssuePathSchema>;
export type SymphonyForensicsIssueQuery = z.infer<typeof symphonyForensicsIssueQuerySchema>;
export type SymphonyForensicsIssueForensicsBundleQuery = z.infer<
  typeof symphonyForensicsIssueForensicsBundleQuerySchema
>;
export type SymphonyForensicsIssueTimelineQuery = z.infer<
  typeof symphonyForensicsIssueTimelineQuerySchema
>;
export type SymphonyForensicsRunPath = z.infer<typeof symphonyForensicsRunPathSchema>;
export type SymphonyForensicsProblemRunsQuery = z.infer<
  typeof symphonyForensicsProblemRunsQuerySchema
>;
