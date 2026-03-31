import { createEnvelopeSchema } from "@symphony/errors";
import { z } from "zod";
import { jsonObjectSchema } from "../../core/json.js";
import {
  isoTimestampSchema,
  nonEmptyStringSchema,
  nullableNonEmptyStringSchema
} from "../../core/shared.js";

export const symphonyRuntimeTokenTotalsSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
});

export const symphonyRuntimeCodexTotalsSchema = symphonyRuntimeTokenTotalsSchema.extend({
  secondsRunning: z.number().nonnegative()
});

export const symphonyRuntimeRunningEntrySchema = z.strictObject({
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  state: nonEmptyStringSchema,
  workerHost: nullableNonEmptyStringSchema.optional(),
  workspacePath: nullableNonEmptyStringSchema.optional(),
  sessionId: nullableNonEmptyStringSchema.optional(),
  turnCount: z.number().int().nonnegative(),
  lastEvent: nullableNonEmptyStringSchema.optional(),
  lastMessage: nullableNonEmptyStringSchema.optional(),
  startedAt: isoTimestampSchema.nullable(),
  lastEventAt: isoTimestampSchema.nullable(),
  tokens: symphonyRuntimeTokenTotalsSchema
});

export const symphonyRuntimeRetryEntrySchema = z.strictObject({
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  attempt: z.number().int().positive(),
  dueAt: isoTimestampSchema.nullable(),
  error: nullableNonEmptyStringSchema.optional(),
  workerHost: nullableNonEmptyStringSchema.optional(),
  workspacePath: nullableNonEmptyStringSchema.optional()
});

export const symphonyRuntimeStateResultSchema = z.strictObject({
  counts: z.strictObject({
    running: z.number().int().nonnegative(),
    retrying: z.number().int().nonnegative()
  }),
  running: z.array(symphonyRuntimeRunningEntrySchema),
  retrying: z.array(symphonyRuntimeRetryEntrySchema),
  codexTotals: symphonyRuntimeCodexTotalsSchema,
  rateLimits: jsonObjectSchema.nullable()
});

export const symphonyRuntimeWorkspaceSchema = z.strictObject({
  path: nonEmptyStringSchema,
  host: nullableNonEmptyStringSchema
});

export const symphonyRuntimeAttemptsSchema = z.strictObject({
  restartCount: z.number().int().nonnegative(),
  currentRetryAttempt: z.number().int().nonnegative()
});

export const symphonyRuntimeIssueStatusSchema = z.enum(["running", "retrying"]);

export const symphonyRuntimeIssueRunningStateSchema = z.strictObject({
  workerHost: nullableNonEmptyStringSchema.optional(),
  workspacePath: nullableNonEmptyStringSchema.optional(),
  sessionId: nullableNonEmptyStringSchema.optional(),
  turnCount: z.number().int().nonnegative(),
  state: nonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  lastEvent: nullableNonEmptyStringSchema.optional(),
  lastMessage: nullableNonEmptyStringSchema.optional(),
  lastEventAt: isoTimestampSchema.nullable(),
  tokens: symphonyRuntimeTokenTotalsSchema
});

export const symphonyRuntimeIssueRetryStateSchema = z.strictObject({
  attempt: z.number().int().positive(),
  dueAt: isoTimestampSchema.nullable(),
  error: nullableNonEmptyStringSchema.optional(),
  workerHost: nullableNonEmptyStringSchema.optional(),
  workspacePath: nullableNonEmptyStringSchema.optional()
});

export const symphonyRuntimeIssueLogSchema = z.strictObject({
  label: nonEmptyStringSchema,
  path: nonEmptyStringSchema,
  url: z.string().url().nullable()
});

export const symphonyRuntimeIssueRecentEventSchema = z.strictObject({
  at: isoTimestampSchema,
  event: nullableNonEmptyStringSchema,
  message: nullableNonEmptyStringSchema
});

export const symphonyRuntimeTrackedIssueSchema = z.strictObject({
  title: nonEmptyStringSchema,
  state: nonEmptyStringSchema,
  branchName: nullableNonEmptyStringSchema,
  url: z.string().url().nullable(),
  projectName: nullableNonEmptyStringSchema,
  projectSlug: nullableNonEmptyStringSchema,
  teamKey: nullableNonEmptyStringSchema
});

export const symphonyRuntimeIssueOperatorSchema = z.strictObject({
  refreshPath: nonEmptyStringSchema,
  refreshDelegatesTo: z.tuple([z.literal("poll"), z.literal("reconcile")]),
  githubPullRequestSearchUrl: z.string().url().nullable(),
  requeueDelegatesTo: z
    .array(z.enum(["linear", "github_rework_comment"]))
    .nonempty(),
  requeueCommand: nonEmptyStringSchema,
  requeueHelpText: nonEmptyStringSchema
});

export const symphonyRuntimeIssueResultSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema,
  issueId: nonEmptyStringSchema,
  status: symphonyRuntimeIssueStatusSchema,
  workspace: symphonyRuntimeWorkspaceSchema,
  attempts: symphonyRuntimeAttemptsSchema,
  running: symphonyRuntimeIssueRunningStateSchema.nullable(),
  retry: symphonyRuntimeIssueRetryStateSchema.nullable(),
  logs: z.strictObject({
    codexSessionLogs: z.array(symphonyRuntimeIssueLogSchema)
  }),
  recentEvents: z.array(symphonyRuntimeIssueRecentEventSchema),
  lastError: nullableNonEmptyStringSchema,
  tracked: symphonyRuntimeTrackedIssueSchema,
  operator: symphonyRuntimeIssueOperatorSchema
});

export const symphonyRuntimeRefreshResultSchema = z.strictObject({
  queued: z.boolean(),
  coalesced: z.boolean(),
  requestedAt: isoTimestampSchema,
  operations: z.tuple([z.literal("poll"), z.literal("reconcile")])
});

export const symphonyRuntimeStateResponseSchema = createEnvelopeSchema(
  symphonyRuntimeStateResultSchema
);
export const symphonyRuntimeIssueResponseSchema = createEnvelopeSchema(
  symphonyRuntimeIssueResultSchema
);
export const symphonyRuntimeRefreshResponseSchema = createEnvelopeSchema(
  symphonyRuntimeRefreshResultSchema
);

export type SymphonyRuntimeTokenTotals = z.infer<typeof symphonyRuntimeTokenTotalsSchema>;
export type SymphonyRuntimeCodexTotals = z.infer<typeof symphonyRuntimeCodexTotalsSchema>;
export type SymphonyRuntimeRunningEntry = z.infer<typeof symphonyRuntimeRunningEntrySchema>;
export type SymphonyRuntimeRetryEntry = z.infer<typeof symphonyRuntimeRetryEntrySchema>;
export type SymphonyRuntimeStateResult = z.infer<typeof symphonyRuntimeStateResultSchema>;
export type SymphonyRuntimeTrackedIssue = z.infer<typeof symphonyRuntimeTrackedIssueSchema>;
export type SymphonyRuntimeIssueOperator = z.infer<typeof symphonyRuntimeIssueOperatorSchema>;
export type SymphonyRuntimeIssueResult = z.infer<typeof symphonyRuntimeIssueResultSchema>;
export type SymphonyRuntimeRefreshResult = z.infer<typeof symphonyRuntimeRefreshResultSchema>;
