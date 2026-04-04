import { z } from "zod";
import { nonEmptyStringSchema } from "./shared.js";

export const symphonyCodexUsageSchema = z.strictObject({
  input_tokens: z.number().int().nonnegative(),
  cached_input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative()
});

export const symphonyCodexCommandExecutionStatusSchema = z.enum([
  "in_progress",
  "completed",
  "failed"
]);

export const symphonyCodexCommandExecutionItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("command_execution"),
  command: z.string(),
  aggregated_output: z.string(),
  exit_code: z.number().int().optional(),
  status: symphonyCodexCommandExecutionStatusSchema
});

export const symphonyCodexFileUpdateChangeSchema = z.strictObject({
  path: nonEmptyStringSchema,
  kind: z.enum(["add", "delete", "update"])
});

export const symphonyCodexFileChangeItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("file_change"),
  changes: z.array(symphonyCodexFileUpdateChangeSchema),
  status: z.enum(["completed", "failed"])
});

export const symphonyCodexMcpToolCallItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("mcp_tool_call"),
  server: nonEmptyStringSchema,
  tool: nonEmptyStringSchema,
  arguments: z.unknown(),
  result: z
    .strictObject({
      content: z.array(z.unknown()),
      structured_content: z.unknown().optional()
    })
    .optional(),
  error: z
    .strictObject({
      message: nonEmptyStringSchema
    })
    .optional(),
  status: z.enum(["in_progress", "completed", "failed"])
});

export const symphonyCodexAgentMessageItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("agent_message"),
  text: z.string()
});

export const symphonyCodexReasoningItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("reasoning"),
  text: z.string()
});

export const symphonyCodexWebSearchItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("web_search"),
  query: z.string()
});

export const symphonyCodexErrorItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("error"),
  message: z.string()
});

export const symphonyCodexTodoItemSchema = z.strictObject({
  text: z.string(),
  completed: z.boolean()
});

export const symphonyCodexTodoListItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("todo_list"),
  items: z.array(symphonyCodexTodoItemSchema)
});

export const symphonyCodexThreadItemSchema = z.discriminatedUnion("type", [
  symphonyCodexAgentMessageItemSchema,
  symphonyCodexReasoningItemSchema,
  symphonyCodexCommandExecutionItemSchema,
  symphonyCodexFileChangeItemSchema,
  symphonyCodexMcpToolCallItemSchema,
  symphonyCodexWebSearchItemSchema,
  symphonyCodexTodoListItemSchema,
  symphonyCodexErrorItemSchema
]);

export const symphonyCodexThreadStartedEventSchema = z.strictObject({
  type: z.literal("thread.started"),
  thread_id: nonEmptyStringSchema
});

export const symphonyCodexTurnStartedEventSchema = z.strictObject({
  type: z.literal("turn.started")
});

export const symphonyCodexTurnCompletedEventSchema = z.strictObject({
  type: z.literal("turn.completed"),
  usage: symphonyCodexUsageSchema
});

export const symphonyCodexTurnFailedEventSchema = z.strictObject({
  type: z.literal("turn.failed"),
  error: z.strictObject({
    message: nonEmptyStringSchema
  })
});

export const symphonyCodexItemStartedEventSchema = z.strictObject({
  type: z.literal("item.started"),
  item: symphonyCodexThreadItemSchema
});

export const symphonyCodexItemUpdatedEventSchema = z.strictObject({
  type: z.literal("item.updated"),
  item: symphonyCodexThreadItemSchema
});

export const symphonyCodexItemCompletedEventSchema = z.strictObject({
  type: z.literal("item.completed"),
  item: symphonyCodexThreadItemSchema
});

export const symphonyCodexStreamErrorEventSchema = z.strictObject({
  type: z.literal("error"),
  message: nonEmptyStringSchema
});

export const symphonyCodexAnalyticsEventSchema = z.discriminatedUnion("type", [
  symphonyCodexThreadStartedEventSchema,
  symphonyCodexTurnStartedEventSchema,
  symphonyCodexTurnCompletedEventSchema,
  symphonyCodexTurnFailedEventSchema,
  symphonyCodexItemStartedEventSchema,
  symphonyCodexItemUpdatedEventSchema,
  symphonyCodexItemCompletedEventSchema,
  symphonyCodexStreamErrorEventSchema
]);
