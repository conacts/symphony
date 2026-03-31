import { z } from "zod";
import { isoTimestampSchema, nonEmptyStringSchema } from "../../core/shared.js";

export const symphonyRealtimeChannelSchema = z.enum([
  "runtime",
  "issues",
  "runs",
  "problem-runs"
]);

export const symphonyRealtimeClientMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("subscribe"),
    channels: z.array(symphonyRealtimeChannelSchema).min(1)
  }),
  z.strictObject({
    type: z.literal("unsubscribe"),
    channels: z.array(symphonyRealtimeChannelSchema).min(1)
  }),
  z.strictObject({
    type: z.literal("ping"),
    id: nonEmptyStringSchema.optional()
  })
]);

export const symphonyRealtimeConnectionAckMessageSchema = z.strictObject({
  type: z.literal("connection.ack"),
  connectionId: nonEmptyStringSchema,
  subscribedChannels: z.array(symphonyRealtimeChannelSchema),
  generatedAt: isoTimestampSchema
});

export const symphonyRealtimeSnapshotUpdatedMessageSchema = z.strictObject({
  type: z.literal("runtime.snapshot.updated"),
  channel: z.literal("runtime"),
  generatedAt: isoTimestampSchema,
  invalidate: z.tuple([z.literal("/api/v1/state")])
});

export const symphonyRealtimeIssueUpdatedMessageSchema = z.strictObject({
  type: z.literal("issue.updated"),
  channel: z.literal("issues"),
  issueIdentifier: nonEmptyStringSchema,
  generatedAt: isoTimestampSchema,
  invalidate: z.array(z.string()).min(1)
});

export const symphonyRealtimeRunUpdatedMessageSchema = z.strictObject({
  type: z.literal("run.updated"),
  channel: z.literal("runs"),
  runId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema.optional(),
  generatedAt: isoTimestampSchema,
  invalidate: z.array(z.string()).min(1)
});

export const symphonyRealtimeProblemRunsUpdatedMessageSchema = z.strictObject({
  type: z.literal("problem-runs.updated"),
  channel: z.literal("problem-runs"),
  generatedAt: isoTimestampSchema,
  invalidate: z.tuple([z.literal("/api/v1/problem-runs")])
});

export const symphonyRealtimeServerMessageSchema = z.discriminatedUnion("type", [
  symphonyRealtimeConnectionAckMessageSchema,
  symphonyRealtimeSnapshotUpdatedMessageSchema,
  symphonyRealtimeIssueUpdatedMessageSchema,
  symphonyRealtimeRunUpdatedMessageSchema,
  symphonyRealtimeProblemRunsUpdatedMessageSchema,
  z.strictObject({
    type: z.literal("pong"),
    id: nonEmptyStringSchema.optional(),
    generatedAt: isoTimestampSchema
  })
]);

export type SymphonyRealtimeChannel = z.infer<typeof symphonyRealtimeChannelSchema>;
export type SymphonyRealtimeClientMessage = z.infer<typeof symphonyRealtimeClientMessageSchema>;
export type SymphonyRealtimeServerMessage = z.infer<typeof symphonyRealtimeServerMessageSchema>;
