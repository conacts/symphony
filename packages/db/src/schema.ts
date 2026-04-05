import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { ThreadEvent } from "@symphony/agent-analytics";
export const symphonyAgentEventLogTable = sqliteTable(
  "symphony_agent_event_log",
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
    projectionLossOverflowId: text("projection_loss_overflow_id"),
    rawPayloadOverflowId: text("raw_payload_overflow_id"),
    payloadTruncated: integer("payload_truncated", { mode: "boolean" }).notNull(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    runSequenceIdx: index("symphony_agent_event_log_run_sequence_idx").on(
      table.runId,
      table.sequence
    ),
    runTurnSequenceIdx: index("symphony_agent_event_log_run_turn_sequence_idx").on(
      table.runId,
      table.turnId,
      table.sequence
    ),
    runItemSequenceIdx: index("symphony_agent_event_log_run_item_sequence_idx").on(
      table.runId,
      table.itemId,
      table.sequence
    ),
    threadSequenceIdx: index("symphony_agent_event_log_thread_sequence_idx").on(
      table.threadId,
      table.sequence
    ),
    eventRecordedAtIdx: index("symphony_agent_event_log_event_recorded_at_idx").on(
      table.eventType,
      table.recordedAt
    )
  })
);

export const symphonyAgentPayloadOverflowTable = sqliteTable(
  "symphony_agent_payload_overflow",
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
    runInsertedAtIdx: index("symphony_agent_payload_overflow_run_inserted_at_idx").on(
      table.runId,
      table.insertedAt
    ),
    turnInsertedAtIdx: index("symphony_agent_payload_overflow_turn_inserted_at_idx").on(
      table.turnId,
      table.insertedAt
    ),
    itemInsertedAtIdx: index("symphony_agent_payload_overflow_item_inserted_at_idx").on(
      table.itemId,
      table.insertedAt
    ),
    kindInsertedAtIdx: index("symphony_agent_payload_overflow_kind_inserted_at_idx").on(
      table.kind,
      table.insertedAt
    )
  })
);

export const symphonyAgentRunsTable = sqliteTable(
  "symphony_agent_runs",
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
    issueIdIdx: index("symphony_agent_runs_issue_id_idx").on(table.issueId),
    issueIdentifierIdx: index("symphony_agent_runs_issue_identifier_idx").on(
      table.issueIdentifier
    ),
    startedAtIdx: index("symphony_agent_runs_started_at_idx").on(table.startedAt),
    threadIdIdx: index("symphony_agent_runs_thread_id_idx").on(table.threadId)
  })
);

export const symphonyAgentTurnsTable = sqliteTable(
  "symphony_agent_turns",
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
    runIdIdx: index("symphony_agent_turns_run_id_idx").on(table.runId),
    startedAtIdx: index("symphony_agent_turns_started_at_idx").on(table.startedAt)
  })
);

export const symphonyAgentItemsTable = sqliteTable(
  "symphony_agent_items",
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
      name: "symphony_agent_items_pk"
    }),
    runIdIdx: index("symphony_agent_items_run_id_idx").on(table.runId),
    turnIdIdx: index("symphony_agent_items_turn_id_idx").on(table.turnId),
    itemTypeIdx: index("symphony_agent_items_item_type_idx").on(table.itemType)
  })
);

export const symphonyAgentCommandExecutionsTable = sqliteTable(
  "symphony_agent_command_executions",
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
      name: "symphony_agent_command_executions_pk"
    }),
    runIdIdx: index("symphony_agent_command_executions_run_id_idx").on(table.runId),
    statusIdx: index("symphony_agent_command_executions_status_idx").on(table.status)
  })
);

export const symphonyAgentToolCallsTable = sqliteTable(
  "symphony_agent_tool_calls",
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
      name: "symphony_agent_tool_calls_pk"
    }),
    runIdIdx: index("symphony_agent_tool_calls_run_id_idx").on(table.runId),
    toolIdx: index("symphony_agent_tool_calls_tool_idx").on(table.server, table.tool)
  })
);

// ---------------------------------------------------------------------------
// pi tool tables
// ---------------------------------------------------------------------------
//
// These tables store structured data for known pi tool calls.
// They share the same primary key as symphony_agent_tool_calls
// (run_id, turn_id, item_id) so rows are 1:1 with their parent tool-call row.
//
// The analytics adapter validates raw arguments through Zod schemas
// derived from the real pi tool definitions (TypeBox schemas in
// pi-coding-agent).  Only rows that pass validation get inserted, so
// these tables are always correctly typed — no ad-hoc JSON parsing
// required downstream.

export const piReadsTable = sqliteTable(
  "pi_reads",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    path: text("path").notNull(),
    readOffset: integer("read_offset"),
    readLimit: integer("read_limit"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "pi_reads_pk"
    }),
    runIdIdx: index("pi_reads_run_id_idx").on(table.runId),
    pathIdx: index("pi_reads_path_idx").on(table.path)
  })
);

export const piEditsTable = sqliteTable(
  "pi_edits",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    path: text("path").notNull(),
    editCount: integer("edit_count").notNull(),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "pi_edits_pk"
    }),
    runIdIdx: index("pi_edits_run_id_idx").on(table.runId),
    pathIdx: index("pi_edits_path_idx").on(table.path)
  })
);

export const piWritesTable = sqliteTable(
  "pi_writes",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    path: text("path").notNull(),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "pi_writes_pk"
    }),
    runIdIdx: index("pi_writes_run_id_idx").on(table.runId),
    pathIdx: index("pi_writes_path_idx").on(table.path)
  })
);

export const piGrepsTable = sqliteTable(
  "pi_greps",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    pattern: text("pattern").notNull(),
    searchPath: text("search_path"),
    ignoreCase: integer("ignore_case", { mode: "boolean" }),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "pi_greps_pk"
    }),
    runIdIdx: index("pi_greps_run_id_idx").on(table.runId)
  })
);

export const piFindsTable = sqliteTable(
  "pi_finds",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    pattern: text("pattern").notNull(),
    searchPath: text("search_path"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "pi_finds_pk"
    }),
    runIdIdx: index("pi_finds_run_id_idx").on(table.runId)
  })
);

export const symphonyAgentMessagesTable = sqliteTable(
  "symphony_agent_messages",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    textContent: text("text_content"),
    textPreview: text("text_preview"),
    textOverflowId: text("text_overflow_id"),
    recordedAt: text("recorded_at").notNull(),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "symphony_agent_messages_pk"
    }),
    runIdIdx: index("symphony_agent_messages_run_id_idx").on(table.runId),
    runRecordedAtIdx: index("symphony_agent_messages_run_recorded_at_idx").on(
      table.runId,
      table.recordedAt
    )
  })
);

export const symphonyAgentReasoningTable = sqliteTable(
  "symphony_agent_reasoning",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    textContent: text("text_content"),
    textPreview: text("text_preview"),
    textOverflowId: text("text_overflow_id"),
    recordedAt: text("recorded_at").notNull(),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "symphony_agent_reasoning_pk"
    }),
    runIdIdx: index("symphony_agent_reasoning_run_id_idx").on(table.runId),
    runRecordedAtIdx: index("symphony_agent_reasoning_run_recorded_at_idx").on(
      table.runId,
      table.recordedAt
    )
  })
);

export const symphonyAgentFileChangesTable = sqliteTable(
  "symphony_agent_file_changes",
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
      name: "symphony_agent_file_changes_pk"
    }),
    runIdIdx: index("symphony_agent_file_changes_run_id_idx").on(table.runId),
    pathIdx: index("symphony_agent_file_changes_path_idx").on(table.path)
  })
);

export const symphonyIssuesTable = sqliteTable(
  "symphony_issues",
  {
    issueId: text("issue_id").primaryKey(),
    issueIdentifier: text("issue_identifier").notNull(),
    latestRunStartedAt: text("latest_run_started_at").notNull(),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    issueIdentifierIdx: uniqueIndex("symphony_issues_issue_identifier_idx").on(
      table.issueIdentifier
    ),
    latestRunStartedAtIdx: index("symphony_issues_latest_run_started_at_idx").on(
      table.latestRunStartedAt
    )
  })
);

export const symphonyRunsTable = sqliteTable(
  "symphony_runs",
  {
    runId: text("run_id").primaryKey(),
    issueId: text("issue_id").notNull(),
    issueIdentifier: text("issue_identifier").notNull(),
    attempt: integer("attempt"),
    status: text("status").notNull(),
    outcome: text("outcome"),
    workerHost: text("worker_host"),
    workspacePath: text("workspace_path"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    commitHashStart: text("commit_hash_start"),
    commitHashEnd: text("commit_hash_end"),
    repoStart: text("repo_start", { mode: "json" }).$type<Record<string, unknown> | null>(),
    repoEnd: text("repo_end", { mode: "json" }).$type<Record<string, unknown> | null>(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown> | null>(),
    errorClass: text("error_class"),
    errorMessage: text("error_message"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    issueIdIdx: index("symphony_runs_issue_id_idx").on(table.issueId),
    issueIdentifierIdx: index("symphony_runs_issue_identifier_idx").on(
      table.issueIdentifier
    ),
    startedAtIdx: index("symphony_runs_started_at_idx").on(table.startedAt)
  })
);

export const symphonyTurnsTable = sqliteTable(
  "symphony_turns",
  {
    turnId: text("turn_id").primaryKey(),
    runId: text("run_id").notNull(),
    turnSequence: integer("turn_sequence").notNull(),
    threadId: text("thread_id"),
    agentTurnId: text("agent_turn_id"),
    sessionId: text("session_id"),
    promptText: text("prompt_text").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    usage: text("usage", { mode: "json" }).$type<Record<string, unknown> | null>(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown> | null>(),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    runIdIdx: index("symphony_turns_run_id_idx").on(table.runId),
    runTurnSequenceIdx: uniqueIndex("symphony_turns_run_sequence_idx").on(
      table.runId,
      table.turnSequence
    )
  })
);

export const symphonyEventsTable = sqliteTable(
  "symphony_events",
  {
    eventId: text("event_id").primaryKey(),
    turnId: text("turn_id").notNull(),
    runId: text("run_id").notNull(),
    eventSequence: integer("event_sequence").notNull(),
    eventType: text("event_type").notNull(),
    itemType: text("item_type"),
    itemStatus: text("item_status"),
    recordedAt: text("recorded_at").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>(),
    payloadTruncated: integer("payload_truncated", { mode: "boolean" }).notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
    summary: text("summary"),
    threadId: text("thread_id"),
    agentTurnId: text("agent_turn_id"),
    sessionId: text("session_id"),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    runIdIdx: index("symphony_events_run_id_idx").on(table.runId),
    turnIdIdx: index("symphony_events_turn_id_idx").on(table.turnId),
    turnSequenceIdx: uniqueIndex("symphony_events_turn_sequence_idx").on(
      table.turnId,
      table.eventSequence
    ),
    recordedAtIdx: index("symphony_events_recorded_at_idx").on(table.recordedAt)
  })
);

export const symphonyIssueTimelineTable = sqliteTable(
  "symphony_issue_timeline_entries",
  {
    entryId: text("entry_id").primaryKey(),
    issueId: text("issue_id").notNull(),
    issueIdentifier: text("issue_identifier").notNull(),
    runId: text("run_id"),
    turnId: text("turn_id"),
    source: text("source").notNull(),
    eventType: text("event_type").notNull(),
    message: text("message"),
    payload: text("payload", { mode: "json" }).$type<unknown>(),
    recordedAt: text("recorded_at").notNull(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    issueIdentifierIdx: index("symphony_issue_timeline_issue_identifier_idx").on(
      table.issueIdentifier
    ),
    recordedAtIdx: index("symphony_issue_timeline_recorded_at_idx").on(
      table.recordedAt
    )
  })
);

export const symphonyRuntimeLogsTable = sqliteTable(
  "symphony_runtime_logs",
  {
    entryId: text("entry_id").primaryKey(),
    level: text("level").notNull(),
    source: text("source").notNull(),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    issueId: text("issue_id"),
    issueIdentifier: text("issue_identifier"),
    runId: text("run_id"),
    payload: text("payload", { mode: "json" }).$type<unknown>(),
    recordedAt: text("recorded_at").notNull(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    recordedAtIdx: index("symphony_runtime_logs_recorded_at_idx").on(
      table.recordedAt
    ),
    issueIdentifierIdx: index("symphony_runtime_logs_issue_identifier_idx").on(
      table.issueIdentifier
    )
  })
);

export const symphonyGitHubIngressTable = sqliteTable(
  "symphony_github_ingress",
  {
    deliveryId: text("delivery_id").primaryKey(),
    event: text("event").notNull(),
    repository: text("repository").notNull(),
    action: text("action"),
    semanticKey: text("semantic_key"),
    recordedAt: text("recorded_at").notNull()
  },
  (table) => ({
    semanticKeyIdx: index("symphony_github_ingress_semantic_key_idx").on(
      table.semanticKey
    ),
    recordedAtIdx: index("symphony_github_ingress_recorded_at_idx").on(
      table.recordedAt
    )
  })
);

export const symphonyMigrationStateTable = sqliteTable(
  "symphony_migrations",
  {
    name: text("name").primaryKey(),
    checksum: text("checksum").notNull(),
    appliedAt: text("applied_at").notNull()
  }
);

export const symphonyAgentTaskSnapshotsTable = sqliteTable(
  "symphony_agent_task_snapshots",
  {
    snapshotId: text("snapshot_id").primaryKey(),
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    sourceKind: text("source_kind").notNull(),
    recordedAt: text("recorded_at").notNull(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    runIdIdx: index("symphony_agent_task_snapshots_run_id_idx").on(table.runId),
    turnIdIdx: index("symphony_agent_task_snapshots_turn_id_idx").on(table.turnId),
    itemIdIdx: index("symphony_agent_task_snapshots_item_id_idx").on(table.itemId),
    recordedAtIdx: index("symphony_agent_task_snapshots_recorded_at_idx").on(table.recordedAt)
  })
);

export const symphonyAgentTaskSnapshotItemsTable = sqliteTable(
  "symphony_agent_task_snapshot_items",
  {
    snapshotId: text("snapshot_id").notNull(),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    state: text("state").notNull(),
    section: text("section"),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    pk: uniqueIndex("symphony_agent_task_snapshot_items_pk").on(
      table.snapshotId,
      table.position
    ),
    snapshotIdIdx: index("symphony_agent_task_snapshot_items_snapshot_id_idx").on(table.snapshotId),
    stateIdx: index("symphony_agent_task_snapshot_items_state_idx").on(table.state)
  })
);

export const symphonySchema = {
  symphonyAgentEventLogTable,
  symphonyAgentPayloadOverflowTable,
  symphonyAgentRunsTable,
  symphonyAgentTurnsTable,
  symphonyAgentItemsTable,
  symphonyAgentCommandExecutionsTable,
  symphonyAgentToolCallsTable,
  piReadsTable,
  piEditsTable,
  piWritesTable,
  piGrepsTable,
  piFindsTable,
  symphonyAgentMessagesTable,
  symphonyAgentReasoningTable,
  symphonyAgentFileChangesTable,
  symphonyAgentTaskSnapshotsTable,
  symphonyAgentTaskSnapshotItemsTable,
  symphonyIssuesTable,
  symphonyRunsTable,
  symphonyTurnsTable,
  symphonyEventsTable,
  symphonyIssueTimelineTable,
  symphonyRuntimeLogsTable,
  symphonyGitHubIngressTable,
  symphonyMigrationStateTable
};
