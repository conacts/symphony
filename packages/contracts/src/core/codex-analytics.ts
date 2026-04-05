import { z } from "zod";
import {
  isThreadEvent,
  extractUsage,
  type ThreadEvent
} from "@symphony/codex-analytics";
import { nonEmptyStringSchema } from "./shared.js";

export const symphonyAgentUsageSchema = z.strictObject({
  input_tokens: z.number().int().nonnegative(),
  cached_input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative()
});

export const symphonyAgentCommandExecutionStatusSchema = z.enum([
  "in_progress",
  "completed",
  "failed"
]);

export const symphonyAgentCommandExecutionItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("command_execution"),
  command: z.string(),
  aggregated_output: z.string(),
  exit_code: z.number().int().optional(),
  status: symphonyAgentCommandExecutionStatusSchema
});

export const symphonyAgentFileUpdateChangeSchema = z.strictObject({
  path: nonEmptyStringSchema,
  kind: z.enum(["add", "delete", "update"])
});

export const symphonyAgentFileChangeItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("file_change"),
  changes: z.array(symphonyAgentFileUpdateChangeSchema),
  status: z.enum(["completed", "failed"])
});

export const symphonyAgentMcpToolCallItemSchema = z.strictObject({
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

export const symphonyAgentAgentMessageItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("agent_message"),
  text: z.string()
});

export const symphonyAgentReasoningItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("reasoning"),
  text: z.string()
});

export const symphonyAgentWebSearchItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("web_search"),
  query: z.string()
});

export const symphonyAgentErrorItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("error"),
  message: z.string()
});

export const symphonyAgentTodoItemSchema = z.strictObject({
  text: z.string(),
  completed: z.boolean()
});

export const symphonyAgentTodoListItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("todo_list"),
  items: z.array(symphonyAgentTodoItemSchema)
});

export const symphonyAgentThreadItemSchema = z.discriminatedUnion("type", [
  symphonyAgentAgentMessageItemSchema,
  symphonyAgentReasoningItemSchema,
  symphonyAgentCommandExecutionItemSchema,
  symphonyAgentFileChangeItemSchema,
  symphonyAgentMcpToolCallItemSchema,
  symphonyAgentWebSearchItemSchema,
  symphonyAgentTodoListItemSchema,
  symphonyAgentErrorItemSchema
]);

export const symphonyAgentThreadStartedEventSchema = z.strictObject({
  type: z.literal("thread.started"),
  thread_id: nonEmptyStringSchema
});

export const symphonyAgentTurnStartedEventSchema = z.strictObject({
  type: z.literal("turn.started")
});

export const symphonyAgentTurnCompletedEventSchema = z.strictObject({
  type: z.literal("turn.completed"),
  usage: symphonyAgentUsageSchema
});

export const symphonyAgentTurnFailedEventSchema = z.strictObject({
  type: z.literal("turn.failed"),
  error: z.strictObject({
    message: nonEmptyStringSchema
  })
});

export const symphonyAgentItemStartedEventSchema = z.strictObject({
  type: z.literal("item.started"),
  item: symphonyAgentThreadItemSchema
});

export const symphonyAgentItemUpdatedEventSchema = z.strictObject({
  type: z.literal("item.updated"),
  item: symphonyAgentThreadItemSchema
});

export const symphonyAgentItemCompletedEventSchema = z.strictObject({
  type: z.literal("item.completed"),
  item: symphonyAgentThreadItemSchema
});

export const symphonyAgentStreamErrorEventSchema = z.strictObject({
  type: z.literal("error"),
  message: nonEmptyStringSchema
});

export const symphonyAgentAnalyticsEventSchema = z.custom<ThreadEvent>(
  (value) => isThreadEvent(value),
  {
    message: "Invalid Agent ThreadEvent payload."
  }
);

export const symphonyCodexUsageSchema = symphonyAgentUsageSchema;
export const symphonyCodexCommandExecutionStatusSchema =
  symphonyAgentCommandExecutionStatusSchema;
export const symphonyCodexCommandExecutionItemSchema =
  symphonyAgentCommandExecutionItemSchema;
export const symphonyCodexFileUpdateChangeSchema =
  symphonyAgentFileUpdateChangeSchema;
export const symphonyCodexFileChangeItemSchema =
  symphonyAgentFileChangeItemSchema;
export const symphonyCodexMcpToolCallItemSchema =
  symphonyAgentMcpToolCallItemSchema;
export const symphonyCodexAgentMessageItemSchema =
  symphonyAgentAgentMessageItemSchema;
export const symphonyCodexReasoningItemSchema =
  symphonyAgentReasoningItemSchema;
export const symphonyCodexWebSearchItemSchema = symphonyAgentWebSearchItemSchema;
export const symphonyCodexErrorItemSchema = symphonyAgentErrorItemSchema;
export const symphonyCodexTodoItemSchema = symphonyAgentTodoItemSchema;
export const symphonyCodexTodoListItemSchema =
  symphonyAgentTodoListItemSchema;
export const symphonyCodexThreadItemSchema = symphonyAgentThreadItemSchema;
export const symphonyCodexThreadStartedEventSchema =
  symphonyAgentThreadStartedEventSchema;
export const symphonyCodexTurnStartedEventSchema =
  symphonyAgentTurnStartedEventSchema;
export const symphonyCodexTurnCompletedEventSchema =
  symphonyAgentTurnCompletedEventSchema;
export const symphonyCodexTurnFailedEventSchema =
  symphonyAgentTurnFailedEventSchema;
export const symphonyCodexItemStartedEventSchema =
  symphonyAgentItemStartedEventSchema;
export const symphonyCodexItemUpdatedEventSchema =
  symphonyAgentItemUpdatedEventSchema;
export const symphonyCodexItemCompletedEventSchema =
  symphonyAgentItemCompletedEventSchema;
export const symphonyCodexStreamErrorEventSchema =
  symphonyAgentStreamErrorEventSchema;
export const symphonyCodexAnalyticsEventSchema =
  symphonyAgentAnalyticsEventSchema;

export { isThreadEvent, extractUsage };
