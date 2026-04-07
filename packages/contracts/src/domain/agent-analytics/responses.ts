import { createEnvelopeSchema } from "@symphony/errors";
import { z } from "zod";
import {
  symphonyAgentAnalyticsEventSchema,
  symphonyAgentUsageSchema
} from "../../core/agent-analytics.js";
import { jsonValueSchema } from "../../core/json.js";
import {
  isoTimestampSchema,
  nonEmptyStringSchema,
  nullableNonEmptyStringSchema
} from "../../core/shared.js";

const agentRunTerminalStatuses = new Set([
  "completed",
  "paused",
  "failed",
  "startup_failed",
  "rate_limited",
  "stalled",
  "stopped"
]);

const agentTurnTerminalStatuses = new Set([
  "completed",
  "failed",
  "stopped"
]);

export const symphonyAgentActiveHarnessKindSchema = z.literal("pi");
export const symphonyAgentCompatHarnessKindSchema = symphonyAgentActiveHarnessKindSchema;

export const symphonyAgentRunStatusSchema = z.enum([
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

export const symphonyAgentTurnStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "stopped"
]);

export const symphonyAgentItemLifecycleStatusSchema = z.enum([
  "in_progress",
  "completed",
  "failed"
]);

export const symphonyAgentRunRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  threadId: nullableNonEmptyStringSchema,
  harnessKind: symphonyAgentCompatHarnessKindSchema.nullable().default(null),
  model: nullableNonEmptyStringSchema.default(null),
  providerId: nullableNonEmptyStringSchema.default(null),
  providerName: nullableNonEmptyStringSchema.default(null),
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema.nullable(),
  status: symphonyAgentRunStatusSchema,
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
  if (!agentRunTerminalStatuses.has(value.status)) {
    return;
  }

  if (!value.endedAt) {
    context.addIssue({
      code: "custom",
      message: "Terminal agent runs must include endedAt.",
      path: ["endedAt"]
    });
  }
});

export const symphonyAgentTurnRecordSchema = z.strictObject({
  turnId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  threadId: nullableNonEmptyStringSchema,
  harnessKind: symphonyAgentCompatHarnessKindSchema.nullable().default(null),
  model: nullableNonEmptyStringSchema.default(null),
  providerId: nullableNonEmptyStringSchema.default(null),
  providerName: nullableNonEmptyStringSchema.default(null),
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema.nullable(),
  status: symphonyAgentTurnStatusSchema,
  failureKind: nullableNonEmptyStringSchema,
  failureMessagePreview: nullableNonEmptyStringSchema,
  lastAgentMessageItemId: nullableNonEmptyStringSchema,
  lastAgentMessagePreview: nullableNonEmptyStringSchema,
  lastAgentMessageOverflowId: nullableNonEmptyStringSchema,
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  usage: symphonyAgentUsageSchema.nullable(),
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
  if (!agentTurnTerminalStatuses.has(value.status)) {
    return;
  }

  if (!value.endedAt) {
    context.addIssue({
      code: "custom",
      message: "Terminal agent turns must include endedAt.",
      path: ["endedAt"]
    });
  }
});

export const symphonyAgentItemRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  itemType: nonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  lastUpdatedAt: isoTimestampSchema.nullable(),
  completedAt: isoTimestampSchema.nullable(),
  finalStatus: symphonyAgentItemLifecycleStatusSchema.nullable(),
  updateCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable(),
  latestPreview: nullableNonEmptyStringSchema,
  latestOverflowId: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyAgentCommandExecutionRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  command: z.string(),
  status: symphonyAgentItemLifecycleStatusSchema,
  exitCode: z.number().int().nullable(),
  timeoutSeconds: z.number().int().nonnegative().nullable(),
  startedAt: isoTimestampSchema.nullable(),
  completedAt: isoTimestampSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  outputPreview: nullableNonEmptyStringSchema,
  outputOverflowId: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyAgentToolCallRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  server: nonEmptyStringSchema,
  tool: nonEmptyStringSchema,
  status: symphonyAgentItemLifecycleStatusSchema,
  errorMessage: nullableNonEmptyStringSchema,
  argumentsJson: jsonValueSchema,
  resultPreview: nullableNonEmptyStringSchema,
  resultOverflowId: nullableNonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  completedAt: isoTimestampSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  piRead: z
    .strictObject({
      path: nonEmptyStringSchema,
      offset: z.number().int().nonnegative().nullable(),
      limit: z.number().int().nonnegative().nullable()
    })
    .optional(),
  piEdit: z
    .strictObject({
      path: nonEmptyStringSchema,
      editCount: z.number().int().positive(),
      lineCount: z.number().int().nonnegative(),
      firstChangedLine: z.number().int().positive().nullable(),
      diffPreview: nullableNonEmptyStringSchema,
      diffOverflowId: nullableNonEmptyStringSchema,
      edits: z.array(
        z.strictObject({
          oldText: z.string(),
          newText: z.string()
        })
      )
    })
    .optional(),
  piWrite: z
    .strictObject({
      path: nonEmptyStringSchema,
      lineCount: z.number().int().nonnegative(),
      contentBytes: z.number().int().nonnegative(),
      bytesWritten: z.number().int().nonnegative().nullable(),
      diffPreview: nullableNonEmptyStringSchema,
      diffOverflowId: nullableNonEmptyStringSchema
    })
    .optional(),
  piGrep: z
    .strictObject({
      pattern: z.string(),
      path: nullableNonEmptyStringSchema,
      ignoreCase: z.boolean().nullable()
    })
    .optional(),
  piFind: z
    .strictObject({
      pattern: z.string(),
      path: nullableNonEmptyStringSchema
    })
    .optional(),
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyAgentMessageRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  textContent: z.string().nullable(),
  textPreview: nullableNonEmptyStringSchema,
  textOverflowId: nullableNonEmptyStringSchema,
  recordedAt: isoTimestampSchema,
  piMessage: z
    .strictObject({
      responseId: nullableNonEmptyStringSchema,
      api: nullableNonEmptyStringSchema,
      provider: nullableNonEmptyStringSchema,
      model: nullableNonEmptyStringSchema,
      stopReason: nullableNonEmptyStringSchema,
      responseTimestamp: isoTimestampSchema.nullable(),
      inputTokens: z.number().int().nonnegative(),
      cachedInputTokens: z.number().int().nonnegative(),
      cacheWriteTokens: z.number().int().nonnegative().nullable(),
      outputTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative()
    })
    .optional(),
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyAgentReasoningRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  textContent: z.string().nullable(),
  textPreview: nullableNonEmptyStringSchema,
  textOverflowId: nullableNonEmptyStringSchema,
  recordedAt: isoTimestampSchema,
  piMessage: z
    .strictObject({
      responseId: nullableNonEmptyStringSchema,
      api: nullableNonEmptyStringSchema,
      provider: nullableNonEmptyStringSchema,
      model: nullableNonEmptyStringSchema,
      stopReason: nullableNonEmptyStringSchema,
      responseTimestamp: isoTimestampSchema.nullable(),
      inputTokens: z.number().int().nonnegative(),
      cachedInputTokens: z.number().int().nonnegative(),
      cacheWriteTokens: z.number().int().nonnegative().nullable(),
      outputTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative()
    })
    .optional(),
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const symphonyAgentFileChangeRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  path: nonEmptyStringSchema,
  changeKind: nonEmptyStringSchema,
  recordedAt: isoTimestampSchema,
  insertedAt: isoTimestampSchema
});

export const symphonyAgentTaskSnapshotStateSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "cancelled"
]);

export const symphonyAgentTaskSnapshotItemRecordSchema = z.strictObject({
  snapshotId: nonEmptyStringSchema,
  position: z.number().int().nonnegative(),
  label: nonEmptyStringSchema,
  state: symphonyAgentTaskSnapshotStateSchema,
  section: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema
});

export const symphonyAgentTaskSnapshotRecordSchema = z.strictObject({
  snapshotId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  itemId: nonEmptyStringSchema,
  sourceKind: nonEmptyStringSchema,
  recordedAt: isoTimestampSchema,
  insertedAt: isoTimestampSchema,
  items: z.array(symphonyAgentTaskSnapshotItemRecordSchema)
});

export const symphonyAgentTurnActivityRecordSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  status: symphonyAgentTurnStatusSchema,
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema.nullable(),
  messages: z.array(symphonyAgentMessageRecordSchema),
  reasoningBlocks: z.array(symphonyAgentReasoningRecordSchema),
  fileChanges: z.array(symphonyAgentFileChangeRecordSchema),
  taskSnapshots: z.array(symphonyAgentTaskSnapshotRecordSchema)
});

export const symphonyAgentEventRecordSchema = z.strictObject({
  eventId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  threadId: nullableNonEmptyStringSchema,
  itemId: nullableNonEmptyStringSchema,
  eventSequence: z.number().int().positive(),
  eventType: nonEmptyStringSchema,
  recordedAt: isoTimestampSchema,
  payload: symphonyAgentAnalyticsEventSchema,
  payloadOverflowId: nullableNonEmptyStringSchema,
  projectionLossOverflowId: nullableNonEmptyStringSchema,
  rawPayloadOverflowId: nullableNonEmptyStringSchema,
  payloadTruncated: z.boolean(),
  insertedAt: isoTimestampSchema
});

export const symphonyAgentOverflowRecordSchema = z.strictObject({
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

export const symphonyAgentRunArtifactsResultSchema = z.strictObject({
  run: symphonyAgentRunRecordSchema,
  turns: z.array(symphonyAgentTurnRecordSchema),
  items: z.array(symphonyAgentItemRecordSchema),
  commandExecutions: z.array(symphonyAgentCommandExecutionRecordSchema),
  toolCalls: z.array(symphonyAgentToolCallRecordSchema),
  agentMessages: z.array(symphonyAgentMessageRecordSchema),
  reasoning: z.array(symphonyAgentReasoningRecordSchema),
  fileChanges: z.array(symphonyAgentFileChangeRecordSchema),
  taskSnapshots: z.array(symphonyAgentTaskSnapshotRecordSchema),
  turnActivities: z.array(symphonyAgentTurnActivityRecordSchema),
  events: z.array(symphonyAgentEventRecordSchema)
});

export const symphonyAgentTurnListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turns: z.array(symphonyAgentTurnRecordSchema)
});

export const symphonyAgentItemListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  items: z.array(symphonyAgentItemRecordSchema)
});

export const symphonyAgentCommandExecutionListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  commandExecutions: z.array(symphonyAgentCommandExecutionRecordSchema)
});

export const symphonyAgentToolCallListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  toolCalls: z.array(symphonyAgentToolCallRecordSchema)
});

export const symphonyAgentMessageListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  agentMessages: z.array(symphonyAgentMessageRecordSchema)
});

export const symphonyAgentReasoningListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  reasoning: z.array(symphonyAgentReasoningRecordSchema)
});
export const symphonyAgentReasoningBlockListResultSchema =
  symphonyAgentReasoningListResultSchema;

export const symphonyAgentFileChangeListResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  fileChanges: z.array(symphonyAgentFileChangeRecordSchema)
});

export const symphonyAgentOverflowResultSchema = z.strictObject({
  runId: nonEmptyStringSchema,
  overflow: symphonyAgentOverflowRecordSchema
});

export const symphonyAgentRunArtifactsResponseSchema = createEnvelopeSchema(
  symphonyAgentRunArtifactsResultSchema
);
export const symphonyAgentTurnListResponseSchema = createEnvelopeSchema(
  symphonyAgentTurnListResultSchema
);
export const symphonyAgentItemListResponseSchema = createEnvelopeSchema(
  symphonyAgentItemListResultSchema
);
export const symphonyAgentCommandExecutionListResponseSchema = createEnvelopeSchema(
  symphonyAgentCommandExecutionListResultSchema
);
export const symphonyAgentToolCallListResponseSchema = createEnvelopeSchema(
  symphonyAgentToolCallListResultSchema
);
export const symphonyAgentMessageListResponseSchema = createEnvelopeSchema(
  symphonyAgentMessageListResultSchema
);
export const symphonyAgentReasoningBlockListResponseSchema = createEnvelopeSchema(
  symphonyAgentReasoningBlockListResultSchema
);
export const symphonyAgentFileChangeListResponseSchema = createEnvelopeSchema(
  symphonyAgentFileChangeListResultSchema
);
export const symphonyAgentOverflowResponseSchema = createEnvelopeSchema(
  symphonyAgentOverflowResultSchema
);

export type SymphonyAgentRunRecord = z.infer<typeof symphonyAgentRunRecordSchema>;
export type SymphonyAgentTurnRecord = z.infer<typeof symphonyAgentTurnRecordSchema>;
export type SymphonyAgentItemRecord = z.infer<typeof symphonyAgentItemRecordSchema>;
export type SymphonyAgentRunStatus = z.infer<typeof symphonyAgentRunStatusSchema>;
export type SymphonyAgentTurnStatus = z.infer<typeof symphonyAgentTurnStatusSchema>;
export type SymphonyAgentItemLifecycleStatus = z.infer<
  typeof symphonyAgentItemLifecycleStatusSchema
>;
export type SymphonyAgentCommandExecutionRecord = z.infer<
  typeof symphonyAgentCommandExecutionRecordSchema
>;
export type SymphonyAgentToolCallRecord = z.infer<typeof symphonyAgentToolCallRecordSchema>;
export type SymphonyAgentMessageRecord = z.infer<typeof symphonyAgentMessageRecordSchema>;
export type SymphonyAgentReasoningRecord = z.infer<typeof symphonyAgentReasoningRecordSchema>;
export type SymphonyAgentFileChangeRecord = z.infer<typeof symphonyAgentFileChangeRecordSchema>;
export type SymphonyAgentTaskSnapshotState = z.infer<
  typeof symphonyAgentTaskSnapshotStateSchema
>;
export type SymphonyAgentTaskSnapshotItemRecord = z.infer<
  typeof symphonyAgentTaskSnapshotItemRecordSchema
>;
export type SymphonyAgentTaskSnapshotRecord = z.infer<
  typeof symphonyAgentTaskSnapshotRecordSchema
>;
export type SymphonyAgentTurnActivityRecord = z.infer<
  typeof symphonyAgentTurnActivityRecordSchema
>;
export type SymphonyAgentEventRecord = z.infer<typeof symphonyAgentEventRecordSchema>;
export type SymphonyAgentOverflowRecord = z.infer<typeof symphonyAgentOverflowRecordSchema>;
export type SymphonyAgentRunArtifactsResult = z.infer<
  typeof symphonyAgentRunArtifactsResultSchema
>;
export type SymphonyAgentTurnListResult = z.infer<
  typeof symphonyAgentTurnListResultSchema
>;
export type SymphonyAgentItemListResult = z.infer<
  typeof symphonyAgentItemListResultSchema
>;
export type SymphonyAgentCommandExecutionListResult = z.infer<
  typeof symphonyAgentCommandExecutionListResultSchema
>;
export type SymphonyAgentToolCallListResult = z.infer<
  typeof symphonyAgentToolCallListResultSchema
>;
export type SymphonyAgentMessageListResult = z.infer<
  typeof symphonyAgentMessageListResultSchema
>;
export type SymphonyAgentReasoningListResult = z.infer<
  typeof symphonyAgentReasoningListResultSchema
>;
export type SymphonyAgentFileChangeListResult = z.infer<
  typeof symphonyAgentFileChangeListResultSchema
>;
export type SymphonyAgentOverflowResult = z.infer<
  typeof symphonyAgentOverflowResultSchema
>;
export type SymphonyAgentReasoningBlockRecord = SymphonyAgentReasoningRecord;
export type SymphonyAgentReasoningBlockListResult =
  SymphonyAgentReasoningListResult;
