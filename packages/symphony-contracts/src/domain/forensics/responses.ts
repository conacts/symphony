import { createEnvelopeSchema } from "@symphony/errors";
import { z } from "zod";
import { jsonObjectSchema, jsonValueSchema } from "../../core/json.js";
import {
  isoTimestampSchema,
  nonEmptyStringSchema,
  nullableNonEmptyStringSchema
} from "../../core/shared.js";

export const symphonyForensicsIssueSummarySchema = z.strictObject({
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  latestRunStartedAt: isoTimestampSchema.nullable(),
  latestRunId: nullableNonEmptyStringSchema,
  latestRunStatus: nullableNonEmptyStringSchema,
  latestRunOutcome: nullableNonEmptyStringSchema,
  runCount: z.number().int().nonnegative(),
  latestProblemOutcome: nullableNonEmptyStringSchema,
  lastCompletedOutcome: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema.nullable(),
  updatedAt: isoTimestampSchema.nullable()
});

export const symphonyForensicsRunSummarySchema = z.strictObject({
  runId: nonEmptyStringSchema,
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  attempt: z.number().int().nonnegative().nullable(),
  status: nullableNonEmptyStringSchema,
  outcome: nullableNonEmptyStringSchema,
  workerHost: nullableNonEmptyStringSchema,
  workspacePath: nullableNonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema.nullable(),
  commitHashStart: nullableNonEmptyStringSchema,
  commitHashEnd: nullableNonEmptyStringSchema,
  turnCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  lastEventType: nullableNonEmptyStringSchema,
  lastEventAt: isoTimestampSchema.nullable(),
  durationSeconds: z.number().int().nonnegative().nullable()
});

export const symphonyForensicsIssueListResultSchema = z.strictObject({
  issues: z.array(symphonyForensicsIssueSummarySchema),
  problemRuns: z.array(symphonyForensicsRunSummarySchema),
  problemSummary: z.record(z.string(), z.number().int().nonnegative())
});

export const symphonyForensicsIssueDetailResultSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema,
  runs: z.array(symphonyForensicsRunSummarySchema),
  summary: z.strictObject({
    runCount: z.number().int().nonnegative(),
    latestProblemOutcome: nullableNonEmptyStringSchema,
    lastCompletedOutcome: nullableNonEmptyStringSchema
  }),
  filters: z.strictObject({
    limit: z.number().int().positive().nullable()
  })
});

export const symphonyForensicsIssueExportSchema = z.strictObject({
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  latestRunStartedAt: isoTimestampSchema.nullable(),
  latestRunId: nullableNonEmptyStringSchema,
  latestRunStatus: nullableNonEmptyStringSchema,
  latestRunOutcome: nullableNonEmptyStringSchema,
  runCount: z.number().int().nonnegative(),
  latestProblemOutcome: nullableNonEmptyStringSchema,
  lastCompletedOutcome: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema.nullable(),
  updatedAt: isoTimestampSchema.nullable()
});

export const symphonyForensicsRunDetailSchema = symphonyForensicsRunSummarySchema.extend({
  repoStart: jsonObjectSchema.nullable(),
  repoEnd: jsonObjectSchema.nullable(),
  metadata: jsonObjectSchema.nullable(),
  errorClass: nullableNonEmptyStringSchema,
  errorMessage: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema.nullable(),
  updatedAt: isoTimestampSchema.nullable()
});

export const symphonyForensicsEventSchema = z.strictObject({
  eventId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  eventSequence: z.number().int().positive(),
  eventType: nonEmptyStringSchema,
  recordedAt: isoTimestampSchema.nullable(),
  payload: z.union([
    jsonObjectSchema,
    z.array(jsonValueSchema),
    z.string(),
    z.number(),
    z.boolean(),
    z.null()
  ]),
  payloadTruncated: z.boolean(),
  payloadBytes: z.number().int().nonnegative().nullable(),
  summary: nullableNonEmptyStringSchema,
  codexThreadId: nullableNonEmptyStringSchema,
  codexTurnId: nullableNonEmptyStringSchema,
  codexSessionId: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema.nullable()
});

export const symphonyForensicsTurnSchema = z.strictObject({
  turnId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  turnSequence: z.number().int().positive(),
  codexThreadId: nullableNonEmptyStringSchema,
  codexTurnId: nullableNonEmptyStringSchema,
  codexSessionId: nullableNonEmptyStringSchema,
  promptText: nonEmptyStringSchema,
  status: nullableNonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema.nullable(),
  tokens: jsonObjectSchema.nullable(),
  metadata: jsonObjectSchema.nullable(),
  insertedAt: isoTimestampSchema.nullable(),
  updatedAt: isoTimestampSchema.nullable(),
  eventCount: z.number().int().nonnegative(),
  events: z.array(symphonyForensicsEventSchema)
});

export const symphonyForensicsRunDetailResultSchema = z.strictObject({
  issue: symphonyForensicsIssueExportSchema,
  run: symphonyForensicsRunDetailSchema.extend({
    turnCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    lastEventType: nullableNonEmptyStringSchema,
    lastEventAt: isoTimestampSchema.nullable()
  }),
  turns: z.array(symphonyForensicsTurnSchema)
});

export const symphonyForensicsProblemRunsResultSchema = z.strictObject({
  problemRuns: z.array(symphonyForensicsRunSummarySchema),
  problemSummary: z.record(z.string(), z.number().int().nonnegative()),
  filters: z.strictObject({
    outcome: nullableNonEmptyStringSchema,
    issueIdentifier: nullableNonEmptyStringSchema,
    limit: z.number().int().positive().nullable()
  })
});

export const symphonyForensicsIssueListResponseSchema = createEnvelopeSchema(
  symphonyForensicsIssueListResultSchema
);
export const symphonyForensicsIssueDetailResponseSchema = createEnvelopeSchema(
  symphonyForensicsIssueDetailResultSchema
);
export const symphonyForensicsRunDetailResponseSchema = createEnvelopeSchema(
  symphonyForensicsRunDetailResultSchema
);
export const symphonyForensicsProblemRunsResponseSchema = createEnvelopeSchema(
  symphonyForensicsProblemRunsResultSchema
);

export type SymphonyForensicsIssueSummary = z.infer<typeof symphonyForensicsIssueSummarySchema>;
export type SymphonyForensicsRunSummary = z.infer<typeof symphonyForensicsRunSummarySchema>;
export type SymphonyForensicsIssueListResult = z.infer<
  typeof symphonyForensicsIssueListResultSchema
>;
export type SymphonyForensicsIssueDetailResult = z.infer<
  typeof symphonyForensicsIssueDetailResultSchema
>;
export type SymphonyForensicsRunDetailResult = z.infer<
  typeof symphonyForensicsRunDetailResultSchema
>;
export type SymphonyForensicsProblemRunsResult = z.infer<
  typeof symphonyForensicsProblemRunsResultSchema
>;
