import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text
} from "drizzle-orm/sqlite-core";
import type { ThreadEvent } from "./sdk-types.js";

export const codexEventLogTable = sqliteTable(
  "codex_event_log",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    turnId: text("turn_id"),
    threadId: text("thread_id"),
    itemId: text("item_id"),
    eventType: text("event_type").notNull().$type<ThreadEvent["type"]>(),
    sequence: integer("sequence").notNull(),
    recordedAt: text("recorded_at").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<ThreadEvent | null>(),
    payloadOverflowId: text("payload_overflow_id"),
    payloadTruncated: integer("payload_truncated", { mode: "boolean" }).notNull(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    runSequenceIdx: index("codex_event_log_run_sequence_idx").on(
      table.runId,
      table.sequence
    ),
    runTurnSequenceIdx: index("codex_event_log_run_turn_sequence_idx").on(
      table.runId,
      table.turnId,
      table.sequence
    ),
    runItemSequenceIdx: index("codex_event_log_run_item_sequence_idx").on(
      table.runId,
      table.itemId,
      table.sequence
    ),
    threadSequenceIdx: index("codex_event_log_thread_sequence_idx").on(
      table.threadId,
      table.sequence
    ),
    eventRecordedAtIdx: index("codex_event_log_event_recorded_at_idx").on(
      table.eventType,
      table.recordedAt
    )
  })
);

export const codexPayloadOverflowTable = sqliteTable(
  "codex_payload_overflow",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    runId: text("run_id").notNull(),
    turnId: text("turn_id"),
    itemId: text("item_id"),
    contentJson: text("content_json", { mode: "json" }).$type<unknown>(),
    contentText: text("content_text"),
    byteCount: integer("byte_count").notNull(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    runInsertedAtIdx: index("codex_payload_overflow_run_inserted_at_idx").on(
      table.runId,
      table.insertedAt
    ),
    turnInsertedAtIdx: index("codex_payload_overflow_turn_inserted_at_idx").on(
      table.turnId,
      table.insertedAt
    ),
    itemInsertedAtIdx: index("codex_payload_overflow_item_inserted_at_idx").on(
      table.itemId,
      table.insertedAt
    ),
    kindInsertedAtIdx: index("codex_payload_overflow_kind_inserted_at_idx").on(
      table.kind,
      table.insertedAt
    )
  })
);

export const codexRunsTable = sqliteTable(
  "codex_runs",
  {
    runId: text("run_id").primaryKey(),
    threadId: text("thread_id"),
    harnessKind: text("harness_kind"),
    model: text("model"),
    providerId: text("provider_id"),
    providerName: text("provider_name"),
    issueId: text("issue_id").notNull(),
    issueIdentifier: text("issue_identifier").notNull(),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    status: text("status").notNull(),
    failureKind: text("failure_kind"),
    failureOrigin: text("failure_origin"),
    failureMessagePreview: text("failure_message_preview"),
    finalTurnId: text("final_turn_id"),
    lastAgentMessageItemId: text("last_agent_message_item_id"),
    lastAgentMessagePreview: text("last_agent_message_preview"),
    lastAgentMessageOverflowId: text("last_agent_message_overflow_id"),
    inputTokens: integer("input_tokens").notNull(),
    cachedInputTokens: integer("cached_input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    turnCount: integer("turn_count").notNull(),
    itemCount: integer("item_count").notNull(),
    commandCount: integer("command_count").notNull(),
    toolCallCount: integer("tool_call_count").notNull(),
    fileChangeCount: integer("file_change_count").notNull(),
    agentMessageCount: integer("agent_message_count").notNull(),
    reasoningCount: integer("reasoning_count").notNull(),
    errorCount: integer("error_count").notNull(),
    latestEventAt: text("latest_event_at"),
    latestEventType: text("latest_event_type"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    issueIdIdx: index("codex_runs_issue_id_idx").on(table.issueId),
    issueIdentifierIdx: index("codex_runs_issue_identifier_idx").on(
      table.issueIdentifier
    ),
    startedAtIdx: index("codex_runs_started_at_idx").on(table.startedAt),
    threadIdIdx: index("codex_runs_thread_id_idx").on(table.threadId)
  })
);

export const codexTurnsTable = sqliteTable(
  "codex_turns",
  {
    turnId: text("turn_id").primaryKey(),
    runId: text("run_id").notNull(),
    threadId: text("thread_id"),
    harnessKind: text("harness_kind"),
    model: text("model"),
    providerId: text("provider_id"),
    providerName: text("provider_name"),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    status: text("status").notNull(),
    failureKind: text("failure_kind"),
    failureMessagePreview: text("failure_message_preview"),
    lastAgentMessageItemId: text("last_agent_message_item_id"),
    lastAgentMessagePreview: text("last_agent_message_preview"),
    lastAgentMessageOverflowId: text("last_agent_message_overflow_id"),
    inputTokens: integer("input_tokens").notNull(),
    cachedInputTokens: integer("cached_input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    itemCount: integer("item_count").notNull(),
    commandCount: integer("command_count").notNull(),
    toolCallCount: integer("tool_call_count").notNull(),
    fileChangeCount: integer("file_change_count").notNull(),
    agentMessageCount: integer("agent_message_count").notNull(),
    reasoningCount: integer("reasoning_count").notNull(),
    errorCount: integer("error_count").notNull(),
    latestEventAt: text("latest_event_at"),
    latestEventType: text("latest_event_type"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    runIdIdx: index("codex_turns_run_id_idx").on(table.runId),
    startedAtIdx: index("codex_turns_started_at_idx").on(table.startedAt)
  })
);

export const codexItemsTable = sqliteTable(
  "codex_items",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    itemType: text("item_type").notNull(),
    startedAt: text("started_at"),
    lastUpdatedAt: text("last_updated_at"),
    completedAt: text("completed_at"),
    finalStatus: text("final_status"),
    updateCount: integer("update_count").notNull(),
    durationMs: integer("duration_ms"),
    latestPreview: text("latest_preview"),
    latestOverflowId: text("latest_overflow_id"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "codex_items_pk"
    }),
    runIdIdx: index("codex_items_run_id_idx").on(table.runId),
    turnIdIdx: index("codex_items_turn_id_idx").on(table.turnId),
    itemTypeIdx: index("codex_items_item_type_idx").on(table.itemType)
  })
);

export const codexCommandExecutionsTable = sqliteTable(
  "codex_command_executions",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    command: text("command").notNull(),
    status: text("status").notNull(),
    exitCode: integer("exit_code"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    durationMs: integer("duration_ms"),
    outputPreview: text("output_preview"),
    outputOverflowId: text("output_overflow_id"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "codex_command_executions_pk"
    }),
    runIdIdx: index("codex_command_executions_run_id_idx").on(table.runId),
    statusIdx: index("codex_command_executions_status_idx").on(table.status)
  })
);

export const codexToolCallsTable = sqliteTable(
  "codex_tool_calls",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    server: text("server").notNull(),
    tool: text("tool").notNull(),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    argumentsJson: text("arguments_json", { mode: "json" }).$type<unknown>(),
    resultPreview: text("result_preview"),
    resultOverflowId: text("result_overflow_id"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    durationMs: integer("duration_ms"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "codex_tool_calls_pk"
    }),
    runIdIdx: index("codex_tool_calls_run_id_idx").on(table.runId),
    toolIdx: index("codex_tool_calls_tool_idx").on(table.server, table.tool)
  })
);

export const codexAgentMessagesTable = sqliteTable(
  "codex_agent_messages",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    textContent: text("text_content"),
    textPreview: text("text_preview"),
    textOverflowId: text("text_overflow_id"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "codex_agent_messages_pk"
    }),
    runIdIdx: index("codex_agent_messages_run_id_idx").on(table.runId)
  })
);

export const codexReasoningTable = sqliteTable(
  "codex_reasoning",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    textContent: text("text_content"),
    textPreview: text("text_preview"),
    textOverflowId: text("text_overflow_id"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "codex_reasoning_pk"
    }),
    runIdIdx: index("codex_reasoning_run_id_idx").on(table.runId)
  })
);

export const codexFileChangesTable = sqliteTable(
  "codex_file_changes",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    path: text("path").notNull(),
    changeKind: text("change_kind").notNull(),
    recordedAt: text("recorded_at").notNull(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId, table.path],
      name: "codex_file_changes_pk"
    }),
    runIdIdx: index("codex_file_changes_run_id_idx").on(table.runId),
    pathIdx: index("codex_file_changes_path_idx").on(table.path)
  })
);
