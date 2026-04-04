import { z } from "zod";
import {
  symphonyCodexAnalyticsEventSchema,
  symphonyCodexUsageSchema
} from "../../core/codex-analytics.js";
import { jsonValueSchema } from "../../core/json.js";
import {
  isoTimestampSchema,
  nonEmptyStringSchema,
  nullableNonEmptyStringSchema
} from "../../core/shared.js";

export const symphonyCodexRunRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  threadId: nullableNonEmptyStringSchema,
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema.nullable(),
  status: nonEmptyStringSchema,
  failureKind: nullableNonEmptyStringSchema,
  failureOrigin: nullableNonEmptyStringSchema,
  failureMessagePreview: nullableNonEmptyStringSchema,
  finalTurnId: nullableNonEmptyStringSchema,
  lastAgentMessageItemId: nullableNonEmptyStringSchema,
  lastAgentMessagePreview: nullableNonEmptyStringSchema,
  lastAgentMessageOverflowId: nullableNonEmptyStringSchema,
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  turnCount: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  commandCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  fileChangeCount: z.number().int().nonnegative(),
  agentMessageCount: z.number().int().nonnegative(),
  reasoningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  latestEventAt: isoTimestampSchema.nullable(),
  latestEventType: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyCodexTurnRecordSchema = z.strictObject({
  turnId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  threadId: nullableNonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema.nullable(),
  status: nonEmptyStringSchema,
  failureKind: nullableNonEmptyStringSchema,
  failureMessagePreview: nullableNonEmptyStringSchema,
  lastAgentMessageItemId: nullableNonEmptyStringSchema,
  lastAgentMessagePreview: nullableNonEmptyStringSchema,
  lastAgentMessageOverflowId: nullableNonEmptyStringSchema,
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  usage: symphonyCodexUsageSchema.nullable(),
  itemCount: z.number().int().nonnegative(),
  commandCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  fileChangeCount: z.number().int().nonnegative(),
  agentMessageCount: z.number().int().nonnegative(),
  reasoningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  latestEventAt: isoTimestampSchema.nullable(),
  latestEventType: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyCodexItemRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  itemType: nonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  lastUpdatedAt: isoTimestampSchema.nullable(),
  completedAt: isoTimestampSchema.nullable(),
  finalStatus: nullableNonEmptyStringSchema,
  updateCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable(),
  latestPreview: nullableNonEmptyStringSchema,
  latestOverflowId: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyCodexCommandExecutionRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  command: z.string(),
  status: nonEmptyStringSchema,
  exitCode: z.number().int().nullable(),
  startedAt: isoTimestampSchema.nullable(),
  completedAt: isoTimestampSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  outputPreview: nullableNonEmptyStringSchema,
  outputOverflowId: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyCodexToolCallRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  server: nonEmptyStringSchema,
  tool: nonEmptyStringSchema,
  status: nonEmptyStringSchema,
  errorMessage: nullableNonEmptyStringSchema,
  argumentsJson: jsonValueSchema,
  resultPreview: nullableNonEmptyStringSchema,
  resultOverflowId: nullableNonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  completedAt: isoTimestampSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyCodexAgentMessageRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  textContent: z.string().nullable(),
  textPreview: nullableNonEmptyStringSchema,
  textOverflowId: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyCodexReasoningRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  textContent: z.string().nullable(),
  textPreview: nullableNonEmptyStringSchema,
  textOverflowId: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyCodexFileChangeRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  path: nonEmptyStringSchema,
  changeKind: nonEmptyStringSchema,
  recordedAt: isoTimestampSchema,
  insertedAt: isoTimestampSchema
});

export const symphonyCodexEventRecordSchema = z.strictObject({
  eventId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  threadId: nullableNonEmptyStringSchema,
  itemId: nullableNonEmptyStringSchema,
  eventSequence: z.number().int().positive(),
  eventType: nonEmptyStringSchema,
  recordedAt: isoTimestampSchema,
  payload: symphonyCodexAnalyticsEventSchema,
  payloadTruncated: z.boolean(),
  insertedAt: isoTimestampSchema
});

export const symphonyCodexRunArtifactsResultSchema = z.strictObject({
  run: symphonyCodexRunRecordSchema,
  turns: z.array(symphonyCodexTurnRecordSchema),
  items: z.array(symphonyCodexItemRecordSchema),
  commandExecutions: z.array(symphonyCodexCommandExecutionRecordSchema),
  toolCalls: z.array(symphonyCodexToolCallRecordSchema),
  agentMessages: z.array(symphonyCodexAgentMessageRecordSchema),
  reasoning: z.array(symphonyCodexReasoningRecordSchema),
  fileChanges: z.array(symphonyCodexFileChangeRecordSchema),
  events: z.array(symphonyCodexEventRecordSchema)
});

export type SymphonyCodexRunRecord = z.infer<typeof symphonyCodexRunRecordSchema>;
export type SymphonyCodexTurnRecord = z.infer<typeof symphonyCodexTurnRecordSchema>;
export type SymphonyCodexItemRecord = z.infer<typeof symphonyCodexItemRecordSchema>;
export type SymphonyCodexCommandExecutionRecord = z.infer<
  typeof symphonyCodexCommandExecutionRecordSchema
>;
export type SymphonyCodexToolCallRecord = z.infer<typeof symphonyCodexToolCallRecordSchema>;
export type SymphonyCodexAgentMessageRecord = z.infer<
  typeof symphonyCodexAgentMessageRecordSchema
>;
export type SymphonyCodexReasoningRecord = z.infer<typeof symphonyCodexReasoningRecordSchema>;
export type SymphonyCodexFileChangeRecord = z.infer<typeof symphonyCodexFileChangeRecordSchema>;
export type SymphonyCodexEventRecord = z.infer<typeof symphonyCodexEventRecordSchema>;
export type SymphonyCodexRunArtifactsResult = z.infer<
  typeof symphonyCodexRunArtifactsResultSchema
>;
