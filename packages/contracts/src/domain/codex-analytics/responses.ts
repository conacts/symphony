import { createEnvelopeSchema } from "@symphony/errors";
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

const codexRunTerminalStatuses = new Set([
  "completed",
  "paused",
  "failed",
  "startup_failed",
  "rate_limited",
  "stalled",
  "stopped"
]);

const codexTurnTerminalStatuses = new Set([
  "completed",
  "failed",
  "stopped"
]);

export const symphonyCodexRunStatusSchema = z.enum([
  "dispatching",
  "running",
  "completed",
  "paused",
  "failed",
  "startup_failed",
  "rate_limited",
  "stalled",
  "stopped"
]);

export const symphonyCodexTurnStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "stopped"
]);

export const symphonyCodexItemLifecycleStatusSchema = z.enum([
  "in_progress",
  "completed",
  "failed"
]);

export const symphonyCodexRunRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  threadId: nullableNonEmptyStringSchema,
  harnessKind: z.enum(["codex", "opencode", "pi"]).nullable().default(null),
  model: nullableNonEmptyStringSchema.default(null),
  providerId: nullableNonEmptyStringSchema.default(null),
  providerName: nullableNonEmptyStringSchema.default(null),
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema.nullable(),
  status: symphonyCodexRunStatusSchema,
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
}).superRefine((value, context) => {
  if (!codexRunTerminalStatuses.has(value.status)) {
    return;
  }

  if (!value.endedAt) {
    context.addIssue({
      code: "custom",
      message: "Terminal Codex runs must include endedAt.",
      path: ["endedAt"]
    });
  }
});

export const symphonyCodexTurnRecordSchema = z.strictObject({
  turnId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  threadId: nullableNonEmptyStringSchema,
  harnessKind: z.enum(["codex", "opencode", "pi"]).nullable().default(null),
  model: nullableNonEmptyStringSchema.default(null),
  providerId: nullableNonEmptyStringSchema.default(null),
  providerName: nullableNonEmptyStringSchema.default(null),
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema.nullable(),
  status: symphonyCodexTurnStatusSchema,
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
}).superRefine((value, context) => {
  if (!codexTurnTerminalStatuses.has(value.status)) {
    return;
  }

  if (!value.endedAt) {
    context.addIssue({
      code: "custom",
      message: "Terminal Codex turns must include endedAt.",
      path: ["endedAt"]
    });
  }
});

export const symphonyCodexItemRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  itemType: nonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  lastUpdatedAt: isoTimestampSchema.nullable(),
  completedAt: isoTimestampSchema.nullable(),
  finalStatus: symphonyCodexItemLifecycleStatusSchema.nullable(),
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
  status: symphonyCodexItemLifecycleStatusSchema,
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
  status: symphonyCodexItemLifecycleStatusSchema,
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

export const symphonyCodexOverflowRecordSchema = z.strictObject({
  overflowId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  itemId: nullableNonEmptyStringSchema,
  kind: nonEmptyStringSchema,
  contentJson: jsonValueSchema,
  contentText: z.string().nullable(),
  byteCount: z.number().int().nonnegative(),
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

export const symphonyCodexTurnListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turns: z.array(symphonyCodexTurnRecordSchema)
});

export const symphonyCodexItemListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  items: z.array(symphonyCodexItemRecordSchema)
});

export const symphonyCodexCommandExecutionListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  commandExecutions: z.array(symphonyCodexCommandExecutionRecordSchema)
});

export const symphonyCodexToolCallListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  toolCalls: z.array(symphonyCodexToolCallRecordSchema)
});

export const symphonyCodexAgentMessageListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  agentMessages: z.array(symphonyCodexAgentMessageRecordSchema)
});

export const symphonyCodexReasoningListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  reasoning: z.array(symphonyCodexReasoningRecordSchema)
});

export const symphonyCodexFileChangeListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  fileChanges: z.array(symphonyCodexFileChangeRecordSchema)
});

export const symphonyCodexOverflowResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  overflow: symphonyCodexOverflowRecordSchema
});

export const symphonyCodexRunArtifactsResponseSchema = createEnvelopeSchema(
  symphonyCodexRunArtifactsResultSchema
);
export const symphonyCodexTurnListResponseSchema = createEnvelopeSchema(
  symphonyCodexTurnListResultSchema
);
export const symphonyCodexItemListResponseSchema = createEnvelopeSchema(
  symphonyCodexItemListResultSchema
);
export const symphonyCodexCommandExecutionListResponseSchema = createEnvelopeSchema(
  symphonyCodexCommandExecutionListResultSchema
);
export const symphonyCodexToolCallListResponseSchema = createEnvelopeSchema(
  symphonyCodexToolCallListResultSchema
);
export const symphonyCodexAgentMessageListResponseSchema = createEnvelopeSchema(
  symphonyCodexAgentMessageListResultSchema
);
export const symphonyCodexReasoningListResponseSchema = createEnvelopeSchema(
  symphonyCodexReasoningListResultSchema
);
export const symphonyCodexFileChangeListResponseSchema = createEnvelopeSchema(
  symphonyCodexFileChangeListResultSchema
);
export const symphonyCodexOverflowResponseSchema = createEnvelopeSchema(
  symphonyCodexOverflowResultSchema
);

export type SymphonyCodexRunRecord = z.infer<typeof symphonyCodexRunRecordSchema>;
export type SymphonyCodexTurnRecord = z.infer<typeof symphonyCodexTurnRecordSchema>;
export type SymphonyCodexItemRecord = z.infer<typeof symphonyCodexItemRecordSchema>;
export type SymphonyCodexRunStatus = z.infer<typeof symphonyCodexRunStatusSchema>;
export type SymphonyCodexTurnStatus = z.infer<typeof symphonyCodexTurnStatusSchema>;
export type SymphonyCodexItemLifecycleStatus = z.infer<
  typeof symphonyCodexItemLifecycleStatusSchema
>;
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
export type SymphonyCodexOverflowRecord = z.infer<typeof symphonyCodexOverflowRecordSchema>;
export type SymphonyCodexRunArtifactsResult = z.infer<
  typeof symphonyCodexRunArtifactsResultSchema
>;
export type SymphonyCodexTurnListResult = z.infer<
  typeof symphonyCodexTurnListResultSchema
>;
export type SymphonyCodexItemListResult = z.infer<
  typeof symphonyCodexItemListResultSchema
>;
export type SymphonyCodexCommandExecutionListResult = z.infer<
  typeof symphonyCodexCommandExecutionListResultSchema
>;
export type SymphonyCodexToolCallListResult = z.infer<
  typeof symphonyCodexToolCallListResultSchema
>;
export type SymphonyCodexAgentMessageListResult = z.infer<
  typeof symphonyCodexAgentMessageListResultSchema
>;
export type SymphonyCodexReasoningListResult = z.infer<
  typeof symphonyCodexReasoningListResultSchema
>;
export type SymphonyCodexFileChangeListResult = z.infer<
  typeof symphonyCodexFileChangeListResultSchema
>;
export type SymphonyCodexOverflowResult = z.infer<
  typeof symphonyCodexOverflowResultSchema
>;
