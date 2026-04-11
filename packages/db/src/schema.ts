import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import type { ThreadEvent } from "@symphony/agent-analytics";
import { symphonyRunOutcomeValues } from "@symphony/runtime-run-ledger";
import type {
  SymphonyRuntimeRunMode,
  SymphonyRuntimeRunOutcome,
  SymphonyRuntimeRunStatus,
  SymphonyRuntimeTurnStatus
} from "./runtime-run-types.js";

const runStatusValues = [
  "dispatching",
  "running",
  "finished",
  "paused",
  "failed",
  "startup_failed",
  "rate_limited",
  "stalled",
  "stopped"
] as const;

const runOutcomeValues = symphonyRunOutcomeValues;
const runModeValues = [
  "implementation",
  "rework",
  "approved_merge"
] as const;

const turnStatusValues = ["running", "completed", "failed", "stopped"] as const;
const eventItemTypeValues = [
  "agent_message",
  "reasoning",
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "web_search",
  "todo_list",
  "error"
] as const;
const eventItemStatusValues = ["in_progress", "completed", "failed"] as const;
const issueTimelineSourceValues = [
  "orchestrator",
  "agent",
  "tracker",
  "workspace",
  "runtime"
] as const;
const deliveryReportStatusValues = ["completed", "blocked", "partial"] as const;
const deliveryReportSourceValues = ["pi", "runtime"] as const;
const runtimeLogLevelValues = ["debug", "info", "warn", "error"] as const;
const overflowKindValues = [
  "agent_message",
  "command_output",
  "event_payload",
  "projection_losses",
  "raw_harness_payload",
  "reasoning",
  "tool_result"
] as const;
const itemLifecycleStatusValues = ["in_progress", "completed", "failed"] as const;
const commandExecutionStatusValues = ["in_progress", "completed", "failed"] as const;
const toolCallStatusValues = ["in_progress", "completed", "failed"] as const;
const fileChangeKindValues = ["add", "delete", "update"] as const;
const harnessKindValues = ["pi"] as const;
const authModeValues = ["auth_json", "api_key_env"] as const;
const taskSnapshotSourceKindValues = ["pi_queue_update", "todo_list_projection"] as const;
const taskSnapshotStateValues = [
  "pending",
  "in_progress",
  "completed",
  "cancelled"
] as const;
const routeHistoryEventKindValues = [
  "signal_recorded",
  "decision_recorded",
  "command_emitted",
  "command_settled"
] as const;
const routeSignalSourceValues = [
  "tracker",
  "runtime",
  "review",
  "ci",
  "operator",
  "router"
] as const;

function sqlEnum(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(", "));
}
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
    kindCheck: check(
      "symphony_agent_payload_overflow_kind_check",
      sql`${table.kind} in (${sqlEnum(overflowKindValues)})`
    ),
    byteCountCheck: check(
      "symphony_agent_payload_overflow_byte_count_check",
      sql`${table.byteCount} >= 0`
    ),
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
    itemTypeCheck: check(
      "symphony_agent_items_item_type_check",
      sql`${table.itemType} in (${sqlEnum(eventItemTypeValues)})`
    ),
    finalStatusCheck: check(
      "symphony_agent_items_final_status_check",
      sql`${table.finalStatus} is null or ${table.finalStatus} in (${sqlEnum(itemLifecycleStatusValues)})`
    ),
    updateCountCheck: check(
      "symphony_agent_items_update_count_check",
      sql`${table.updateCount} >= 1`
    ),
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
    timeoutSeconds: integer("timeout_seconds"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    durationMs: integer("duration_ms"),
    outputPreview: text("output_preview"),
    outputOverflowId: text("output_overflow_id"),
    resourceProfileJson: text("resource_profile_json", { mode: "json" }).$type<unknown>(),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    statusCheck: check(
      "symphony_agent_command_executions_status_check",
      sql`${table.status} in (${sqlEnum(commandExecutionStatusValues)})`
    ),
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
    statusCheck: check(
      "symphony_agent_tool_calls_status_check",
      sql`${table.status} in (${sqlEnum(toolCallStatusValues)})`
    ),
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
    toolCallFk: foreignKey({
      columns: [table.runId, table.turnId, table.itemId],
      foreignColumns: [
        symphonyAgentToolCallsTable.runId,
        symphonyAgentToolCallsTable.turnId,
        symphonyAgentToolCallsTable.itemId
      ],
      name: "pi_reads_tool_call_fk"
    }).onDelete("cascade"),
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
    lineCount: integer("line_count").notNull(),
    firstChangedLine: integer("first_changed_line"),
    diffPreview: text("diff_preview"),
    diffOverflowId: text("diff_overflow_id"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    toolCallFk: foreignKey({
      columns: [table.runId, table.turnId, table.itemId],
      foreignColumns: [
        symphonyAgentToolCallsTable.runId,
        symphonyAgentToolCallsTable.turnId,
        symphonyAgentToolCallsTable.itemId
      ],
      name: "pi_edits_tool_call_fk"
    }).onDelete("cascade"),
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
    lineCount: integer("line_count").notNull(),
    contentBytes: integer("content_bytes").notNull(),
    bytesWritten: integer("bytes_written"),
    diffPreview: text("diff_preview"),
    diffOverflowId: text("diff_overflow_id"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    toolCallFk: foreignKey({
      columns: [table.runId, table.turnId, table.itemId],
      foreignColumns: [
        symphonyAgentToolCallsTable.runId,
        symphonyAgentToolCallsTable.turnId,
        symphonyAgentToolCallsTable.itemId
      ],
      name: "pi_writes_tool_call_fk"
    }).onDelete("cascade"),
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
    toolCallFk: foreignKey({
      columns: [table.runId, table.turnId, table.itemId],
      foreignColumns: [
        symphonyAgentToolCallsTable.runId,
        symphonyAgentToolCallsTable.turnId,
        symphonyAgentToolCallsTable.itemId
      ],
      name: "pi_greps_tool_call_fk"
    }).onDelete("cascade"),
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
    toolCallFk: foreignKey({
      columns: [table.runId, table.turnId, table.itemId],
      foreignColumns: [
        symphonyAgentToolCallsTable.runId,
        symphonyAgentToolCallsTable.turnId,
        symphonyAgentToolCallsTable.itemId
      ],
      name: "pi_finds_tool_call_fk"
    }).onDelete("cascade"),
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
    itemFk: foreignKey({
      columns: [table.runId, table.turnId, table.itemId],
      foreignColumns: [
        symphonyAgentItemsTable.runId,
        symphonyAgentItemsTable.turnId,
        symphonyAgentItemsTable.itemId
      ],
      name: "symphony_agent_messages_item_fk"
    }).onDelete("cascade"),
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
    itemFk: foreignKey({
      columns: [table.runId, table.turnId, table.itemId],
      foreignColumns: [
        symphonyAgentItemsTable.runId,
        symphonyAgentItemsTable.turnId,
        symphonyAgentItemsTable.itemId
      ],
      name: "symphony_agent_reasoning_item_fk"
    }).onDelete("cascade"),
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

export const piMessageEndsTable = sqliteTable(
  "pi_message_ends",
  {
    runId: text("run_id").notNull(),
    turnId: text("turn_id").notNull(),
    itemId: text("item_id").notNull(),
    responseId: text("response_id"),
    api: text("api"),
    provider: text("provider"),
    model: text("model"),
    stopReason: text("stop_reason"),
    responseTimestamp: text("response_timestamp"),
    inputTokens: integer("input_tokens").notNull(),
    cachedInputTokens: integer("cached_input_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens"),
    outputTokens: integer("output_tokens").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    itemFk: foreignKey({
      columns: [table.runId, table.turnId, table.itemId],
      foreignColumns: [
        symphonyAgentItemsTable.runId,
        symphonyAgentItemsTable.turnId,
        symphonyAgentItemsTable.itemId
      ],
      name: "pi_message_ends_item_fk"
    }).onDelete("cascade"),
    pk: primaryKey({
      columns: [table.runId, table.turnId, table.itemId],
      name: "pi_message_ends_pk"
    }),
    runIdIdx: index("pi_message_ends_run_id_idx").on(table.runId),
    responseIdIdx: index("pi_message_ends_response_id_idx").on(table.responseId),
    modelIdx: index("pi_message_ends_model_idx").on(table.model)
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
    changeKindCheck: check(
      "symphony_agent_file_changes_change_kind_check",
      sql`${table.changeKind} in (${sqlEnum(fileChangeKindValues)})`
    ),
    itemFk: foreignKey({
      columns: [table.runId, table.turnId, table.itemId],
      foreignColumns: [
        symphonyAgentItemsTable.runId,
        symphonyAgentItemsTable.turnId,
        symphonyAgentItemsTable.itemId
      ],
      name: "symphony_agent_file_changes_item_fk"
    }).onDelete("cascade"),
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
    issueIdentifier: text("issue_identifier").primaryKey(),
    trackerIssueId: text("tracker_issue_id").notNull(),
    repositoryKey: text("repository_key").notNull(),
    latestRunStartedAt: text("latest_run_started_at"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    trackerIssueIdIdx: uniqueIndex("symphony_issues_tracker_issue_id_idx").on(
      table.trackerIssueId
    ),
    issueRepositoryKeyIdx: uniqueIndex("symphony_issues_issue_repository_key_idx").on(
      table.issueIdentifier,
      table.repositoryKey
    ),
    repositoryKeyIdx: index("symphony_issues_repository_key_idx").on(table.repositoryKey),
    latestRunStartedAtIdx: index("symphony_issues_latest_run_started_at_idx").on(
      table.latestRunStartedAt
    )
  })
);

export const symphonyRunsTable = sqliteTable(
  "symphony_runs",
  {
    runId: text("run_id").primaryKey(),
    repositoryKey: text("repository_key").notNull(),
    issueIdentifier: text("issue_identifier").notNull(),
    attempt: integer("attempt"),
    runMode: text("run_mode").notNull().$type<SymphonyRuntimeRunMode>(),
    status: text("status").notNull().$type<SymphonyRuntimeRunStatus>(),
    outcome: text("outcome").$type<SymphonyRuntimeRunOutcome | null>(),
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
    machineLoadSampleCount: integer("machine_load_sample_count"),
    machineLoadMaxCpuPercent: integer("machine_load_max_cpu_percent"),
    machineLoadAvgCpuPercent: integer("machine_load_avg_cpu_percent"),
    machineLoadMaxMemoryPercent: integer("machine_load_max_memory_percent"),
    machineLoadAvgMemoryPercent: integer("machine_load_avg_memory_percent"),
    machineLoadMaxDiskPercent: integer("machine_load_max_disk_percent"),
    machineLoadAvgDiskPercent: integer("machine_load_avg_disk_percent"),
    machineLoadHadHighCpu: integer("machine_load_had_high_cpu", { mode: "boolean" }),
    machineLoadHadHighMemory: integer("machine_load_had_high_memory", { mode: "boolean" }),
    machineLoadHadHighDisk: integer("machine_load_had_high_disk", { mode: "boolean" }),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    issueBindingFk: foreignKey({
      columns: [table.issueIdentifier, table.repositoryKey],
      foreignColumns: [symphonyIssuesTable.issueIdentifier, symphonyIssuesTable.repositoryKey],
      name: "symphony_runs_issue_binding_fk"
    }).onDelete("restrict"),
    statusCheck: check(
      "symphony_runs_status_check",
      sql`${table.status} in (${sqlEnum(runStatusValues)})`
    ),
    outcomeCheck: check(
      "symphony_runs_outcome_check",
      sql`${table.outcome} is null or ${table.outcome} in (${sqlEnum(runOutcomeValues)})`
    ),
    attemptCheck: check(
      "symphony_runs_attempt_check",
      sql`${table.attempt} is null or ${table.attempt} >= 1`
    ),
    runModeCheck: check(
      "symphony_runs_run_mode_check",
      sql`${table.runMode} in (${sqlEnum(runModeValues)})`
    ),
    issueRunIdIdx: uniqueIndex("symphony_runs_issue_run_id_idx").on(
      table.issueIdentifier,
      table.runId
    ),
    oneActiveRunPerIssueIdx: uniqueIndex(
      "symphony_runs_one_active_run_per_issue_idx"
    )
      .on(table.issueIdentifier)
      .where(sql`${table.status} in ('dispatching', 'running')`),
    repositoryKeyIdx: index("symphony_runs_repository_key_idx").on(table.repositoryKey),
    issueIdentifierIdx: index("symphony_runs_issue_identifier_idx").on(table.issueIdentifier),
    startedAtIdx: index("symphony_runs_started_at_idx").on(table.startedAt)
  })
);

export const symphonyTurnsTable = sqliteTable(
  "symphony_turns",
  {
    turnId: text("turn_id").primaryKey(),
    runId: text("run_id").notNull(),
    turnSequence: integer("turn_sequence").notNull(),
    threadId: text("thread_id").notNull(),
    agentTurnId: text("agent_turn_id"),
    promptText: text("prompt_text").notNull(),
    status: text("status").notNull().$type<SymphonyRuntimeTurnStatus>(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    usage: text("usage", { mode: "json" }).$type<Record<string, unknown> | null>(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown> | null>(),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    runFk: foreignKey({
      columns: [table.runId],
      foreignColumns: [symphonyRunsTable.runId],
      name: "symphony_turns_run_fk"
    }).onDelete("cascade"),
    statusCheck: check(
      "symphony_turns_status_check",
      sql`${table.status} in (${sqlEnum(turnStatusValues)})`
    ),
    turnSequenceCheck: check(
      "symphony_turns_turn_sequence_check",
      sql`${table.turnSequence} >= 1`
    ),
    runIdIdx: index("symphony_turns_run_id_idx").on(table.runId),
    runTurnIdIdx: uniqueIndex("symphony_turns_run_turn_id_idx").on(
      table.runId,
      table.turnId
    ),
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
    threadId: text("thread_id").notNull(),
    agentTurnId: text("agent_turn_id"),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    runTurnFk: foreignKey({
      columns: [table.runId, table.turnId],
      foreignColumns: [symphonyTurnsTable.runId, symphonyTurnsTable.turnId],
      name: "symphony_events_run_turn_fk"
    }).onDelete("cascade"),
    eventSequenceCheck: check(
      "symphony_events_event_sequence_check",
      sql`${table.eventSequence} >= 1`
    ),
    itemTypeCheck: check(
      "symphony_events_item_type_check",
      sql`${table.itemType} is null or ${table.itemType} in (${sqlEnum(eventItemTypeValues)})`
    ),
    itemStatusCheck: check(
      "symphony_events_item_status_check",
      sql`${table.itemStatus} is null or ${table.itemStatus} in (${sqlEnum(eventItemStatusValues)})`
    ),
    payloadBytesCheck: check(
      "symphony_events_payload_bytes_check",
      sql`${table.payloadBytes} >= 0`
    ),
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
    issueFk: foreignKey({
      columns: [table.issueIdentifier],
      foreignColumns: [symphonyIssuesTable.issueIdentifier],
      name: "symphony_issue_timeline_issue_fk"
    }).onDelete("restrict"),
    sourceCheck: check(
      "symphony_issue_timeline_source_check",
      sql`${table.source} in (${sqlEnum(issueTimelineSourceValues)})`
    ),
    turnRequiresRunCheck: check(
      "symphony_issue_timeline_turn_requires_run_check",
      sql`${table.turnId} is null or ${table.runId} is not null`
    ),
    runFk: foreignKey({
      columns: [table.runId],
      foreignColumns: [symphonyRunsTable.runId],
      name: "symphony_issue_timeline_run_fk"
    }).onDelete("set null"),
    turnFk: foreignKey({
      columns: [table.turnId],
      foreignColumns: [symphonyTurnsTable.turnId],
      name: "symphony_issue_timeline_turn_fk"
    }).onDelete("set null"),
    runTurnFk: foreignKey({
      columns: [table.runId, table.turnId],
      foreignColumns: [symphonyTurnsTable.runId, symphonyTurnsTable.turnId],
      name: "symphony_issue_timeline_run_turn_fk"
    }).onDelete("set null"),
    issueIdentifierIdx: index("symphony_issue_timeline_issue_identifier_idx").on(
      table.issueIdentifier
    ),
    runIdIdx: index("symphony_issue_timeline_run_id_idx").on(
      table.runId
    ),
    recordedAtIdx: index("symphony_issue_timeline_recorded_at_idx").on(
      table.recordedAt
    )
  })
);

export const symphonyIssueDeliveryReportsTable = sqliteTable(
  "symphony_issue_delivery_reports",
  {
    reportId: text("report_id").primaryKey(),
    issueIdentifier: text("issue_identifier").notNull(),
    runId: text("run_id").notNull(),
    turnId: text("turn_id"),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    prUrl: text("pr_url"),
    prNumber: text("pr_number"),
    branchName: text("branch_name"),
    blockingReason: text("blocking_reason"),
    testsSummary: text("tests_summary"),
    source: text("source").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<unknown>(),
    reportedAt: text("reported_at").notNull(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    statusCheck: check(
      "symphony_issue_delivery_reports_status_check",
      sql`${table.status} in (${sqlEnum(deliveryReportStatusValues)})`
    ),
    sourceCheck: check(
      "symphony_issue_delivery_reports_source_check",
      sql`${table.source} in (${sqlEnum(deliveryReportSourceValues)})`
    ),
    completedRequiresPrUrlCheck: check(
      "symphony_issue_delivery_reports_completed_pr_url_check",
      sql`${table.status} != 'completed' or ${table.prUrl} is not null`
    ),
    blockedRequiresReasonCheck: check(
      "symphony_issue_delivery_reports_blocked_reason_check",
      sql`${table.status} != 'blocked' or ${table.blockingReason} is not null`
    ),
    issueRunFk: foreignKey({
      columns: [table.issueIdentifier, table.runId],
      foreignColumns: [symphonyRunsTable.issueIdentifier, symphonyRunsTable.runId],
      name: "symphony_issue_delivery_reports_issue_run_fk"
    }).onDelete("cascade"),
    runTurnFk: foreignKey({
      columns: [table.runId, table.turnId],
      foreignColumns: [symphonyTurnsTable.runId, symphonyTurnsTable.turnId],
      name: "symphony_issue_delivery_reports_run_turn_fk"
    }).onDelete("cascade"),
    issueIdentifierReportedAtIdx: index("symphony_issue_delivery_reports_issue_identifier_idx").on(
      table.issueIdentifier,
      table.reportedAt
    ),
    runIdReportedAtIdx: index("symphony_issue_delivery_reports_run_id_idx").on(
      table.runId,
      table.reportedAt
    ),
    statusReportedAtIdx: index("symphony_issue_delivery_reports_status_idx").on(
      table.status,
      table.reportedAt
    )
  })
);

export const symphonyRuntimeLogsTable = sqliteTable(
  "symphony_runtime_logs",
  {
    entryId: text("entry_id").primaryKey(),
    repositoryKey: text("repository_key").notNull(),
    level: text("level").notNull(),
    source: text("source").notNull(),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    issueIdentifier: text("issue_identifier"),
    runId: text("run_id"),
    payload: text("payload", { mode: "json" }).$type<unknown>(),
    recordedAt: text("recorded_at").notNull(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    issueBindingFk: foreignKey({
      columns: [table.issueIdentifier, table.repositoryKey],
      foreignColumns: [symphonyIssuesTable.issueIdentifier, symphonyIssuesTable.repositoryKey],
      name: "symphony_runtime_logs_issue_binding_fk"
    }).onDelete("restrict"),
    runFk: foreignKey({
      columns: [table.runId],
      foreignColumns: [symphonyRunsTable.runId],
      name: "symphony_runtime_logs_run_fk"
    }).onDelete("set null"),
    levelCheck: check(
      "symphony_runtime_logs_level_check",
      sql`${table.level} in (${sqlEnum(runtimeLogLevelValues)})`
    ),
    repositoryKeyIdx: index("symphony_runtime_logs_repository_key_idx").on(
      table.repositoryKey
    ),
    recordedAtIdx: index("symphony_runtime_logs_recorded_at_idx").on(
      table.recordedAt
    ),
    repositoryIssueIdentifierIdx: index("symphony_runtime_logs_repository_issue_identifier_idx").on(
      table.repositoryKey,
      table.issueIdentifier
    )
  })
);

export const symphonyRunRuntimeContextTable = sqliteTable(
  "symphony_run_runtime_context",
  {
    runId: text("run_id").primaryKey(),
    harnessKind: text("harness_kind"),
    threadId: text("thread_id").notNull(),
    processId: text("process_id"),
    model: text("model"),
    reasoningEffort: text("reasoning_effort"),
    profile: text("profile"),
    providerId: text("provider_id"),
    providerName: text("provider_name"),
    authMode: text("auth_mode"),
    providerEnvKey: text("provider_env_key"),
    launchTarget: text("launch_target_json", { mode: "json" }).$type<Record<string, unknown> | null>(),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    runFk: foreignKey({
      columns: [table.runId],
      foreignColumns: [symphonyRunsTable.runId],
      name: "symphony_run_runtime_context_run_fk"
    }).onDelete("cascade"),
    harnessKindCheck: check(
      "symphony_run_runtime_context_harness_kind_check",
      sql`${table.harnessKind} is null or ${table.harnessKind} in (${sqlEnum(harnessKindValues)})`
    ),
    authModeCheck: check(
      "symphony_run_runtime_context_auth_mode_check",
      sql`${table.authMode} is null or ${table.authMode} in (${sqlEnum(authModeValues)})`
    ),
    threadIdCheck: check(
      "symphony_run_runtime_context_thread_id_check",
      sql`length(trim(${table.threadId})) > 0`
    ),
    harnessKindIdx: index("symphony_run_runtime_context_harness_kind_idx").on(table.harnessKind),
    threadIdIdx: index("symphony_run_runtime_context_thread_id_idx").on(table.threadId)
  })
);

export const routeWorkflowsTable = sqliteTable(
  "route_workflows",
  {
    workflowId: text("workflow_id").primaryKey(),
    repositoryKey: text("repository_key").notNull(),
    issueIdentifier: text("issue_identifier").notNull(),
    routerPresetId: text("router_preset_id").notNull(),
    routerName: text("router_name").notNull(),
    routerVersion: text("router_version").notNull(),
    archivedAt: text("archived_at"),
    insertedAt: text("inserted_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    issueBindingFk: foreignKey({
      columns: [table.issueIdentifier, table.repositoryKey],
      foreignColumns: [symphonyIssuesTable.issueIdentifier, symphonyIssuesTable.repositoryKey],
      name: "route_workflows_issue_binding_fk"
    }).onDelete("restrict"),
    repositoryKeyIdx: index("route_workflows_repository_key_idx").on(table.repositoryKey),
    issueIdentifierIdx: index("route_workflows_issue_identifier_idx").on(
      table.issueIdentifier
    ),
    liveIssueIdx: uniqueIndex("route_workflows_live_issue_idx")
      .on(table.issueIdentifier)
      .where(sql`${table.archivedAt} is null`)
  })
);

export const routeHistoryEventsTable = sqliteTable(
  "route_history_events",
  {
    eventId: text("event_id").primaryKey(),
    workflowId: text("workflow_id").notNull(),
    eventSequence: integer("event_sequence").notNull(),
    kind: text("kind").notNull(),
    recordedAt: text("recorded_at").notNull(),
    signalId: text("signal_id"),
    signalType: text("signal_type"),
    signalSource: text("signal_source"),
    decisionId: text("decision_id"),
    commandId: text("command_id"),
    fromNode: text("from_node"),
    toNode: text("to_node"),
    edgeId: text("edge_id"),
    reasonCode: text("reason_code"),
    eventJson: text("event_json", { mode: "json" }).notNull().$type<unknown>(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    workflowFk: foreignKey({
      columns: [table.workflowId],
      foreignColumns: [routeWorkflowsTable.workflowId],
      name: "route_history_events_workflow_fk"
    }).onDelete("cascade"),
    eventSequenceCheck: check(
      "route_history_events_event_sequence_check",
      sql`${table.eventSequence} >= 1`
    ),
    kindCheck: check(
      "route_history_events_kind_check",
      sql`${table.kind} in (${sqlEnum(routeHistoryEventKindValues)})`
    ),
    signalSourceCheck: check(
      "route_history_events_signal_source_check",
      sql`${table.signalSource} is null or ${table.signalSource} in (${sqlEnum(routeSignalSourceValues)})`
    ),
    signalRecordedShapeCheck: check(
      "route_history_events_signal_recorded_shape_check",
      sql`${table.kind} != 'signal_recorded' or (
        ${table.signalId} is not null and
        ${table.signalType} is not null and
        ${table.signalSource} is not null and
        ${table.decisionId} is null and
        ${table.commandId} is null and
        ${table.fromNode} is null and
        ${table.toNode} is null and
        ${table.edgeId} is null and
        ${table.reasonCode} is null
      )`
    ),
    decisionRecordedShapeCheck: check(
      "route_history_events_decision_recorded_shape_check",
      sql`${table.kind} != 'decision_recorded' or (
        ${table.signalId} is null and
        ${table.signalType} is null and
        ${table.signalSource} is null and
        ${table.decisionId} is not null and
        ${table.commandId} is null and
        ${table.reasonCode} is not null
      )`
    ),
    commandEmittedShapeCheck: check(
      "route_history_events_command_emitted_shape_check",
      sql`${table.kind} != 'command_emitted' or (
        ${table.signalId} is null and
        ${table.signalType} is null and
        ${table.signalSource} is null and
        ${table.decisionId} is not null and
        ${table.commandId} is not null and
        ${table.fromNode} is null and
        ${table.toNode} is null and
        ${table.edgeId} is null and
        ${table.reasonCode} is null
      )`
    ),
    commandSettledShapeCheck: check(
      "route_history_events_command_settled_shape_check",
      sql`${table.kind} != 'command_settled' or (
        ${table.signalId} is null and
        ${table.signalType} is null and
        ${table.signalSource} is null and
        ${table.decisionId} is null and
        ${table.commandId} is not null and
        ${table.fromNode} is null and
        ${table.toNode} is null and
        ${table.edgeId} is null and
        ${table.reasonCode} is null
      )`
    ),
    workflowSequenceIdx: uniqueIndex("route_history_events_workflow_sequence_idx").on(
      table.workflowId,
      table.eventSequence
    ),
    workflowSignalIdIdx: uniqueIndex("route_history_events_workflow_signal_id_idx")
      .on(table.workflowId, table.signalId)
      .where(sql`${table.signalId} is not null`),
    workflowDecisionIdIdx: uniqueIndex("route_history_events_workflow_decision_id_idx")
      .on(table.workflowId, table.decisionId)
      .where(sql`${table.decisionId} is not null and ${table.kind} = 'decision_recorded'`),
    workflowCommandIdIdx: uniqueIndex("route_history_events_workflow_command_id_idx")
      .on(table.workflowId, table.commandId)
      .where(sql`${table.commandId} is not null and ${table.kind} = 'command_emitted'`),
    workflowCommandSettlementIdIdx: uniqueIndex(
      "route_history_events_workflow_command_settlement_id_idx"
    )
      .on(table.workflowId, table.commandId)
      .where(sql`${table.commandId} is not null and ${table.kind} = 'command_settled'`),
    workflowRecordedAtIdx: index("route_history_events_workflow_recorded_at_idx").on(
      table.workflowId,
      table.recordedAt
    )
  })
);

export const routeDecisionsTable = sqliteTable(
  "route_decisions",
  {
    decisionId: text("decision_id").primaryKey(),
    workflowId: text("workflow_id").notNull(),
    eventSequence: integer("event_sequence").notNull(),
    signalId: text("signal_id").notNull(),
    fromNode: text("from_node"),
    toNode: text("to_node"),
    edgeId: text("edge_id"),
    reasonCode: text("reason_code").notNull(),
    policyJson: text("policy_json", { mode: "json" }).notNull().$type<unknown>(),
    projectionBeforeJson: text("projection_before_json", { mode: "json" }).notNull().$type<unknown>(),
    projectionAfterJson: text("projection_after_json", { mode: "json" }).notNull().$type<unknown>(),
    commandsJson: text("commands_json", { mode: "json" }).notNull().$type<unknown>(),
    traceJson: text("trace_json", { mode: "json" }).notNull().$type<unknown>(),
    selectionMetadataJson: text("selection_metadata_json", { mode: "json" }).$type<unknown>(),
    recordedAt: text("recorded_at").notNull(),
    insertedAt: text("inserted_at").notNull()
  },
  (table) => ({
    workflowFk: foreignKey({
      columns: [table.workflowId],
      foreignColumns: [routeWorkflowsTable.workflowId],
      name: "route_decisions_workflow_fk"
    }).onDelete("cascade"),
    workflowEventFk: foreignKey({
      columns: [table.workflowId, table.eventSequence],
      foreignColumns: [routeHistoryEventsTable.workflowId, routeHistoryEventsTable.eventSequence],
      name: "route_decisions_workflow_event_fk"
    }).onDelete("cascade"),
    eventSequenceCheck: check(
      "route_decisions_event_sequence_check",
      sql`${table.eventSequence} >= 1`
    ),
    workflowEventSequenceIdx: uniqueIndex("route_decisions_workflow_event_sequence_idx").on(
      table.workflowId,
      table.eventSequence
    ),
    workflowSignalIdIdx: uniqueIndex("route_decisions_workflow_signal_id_idx").on(
      table.workflowId,
      table.signalId
    ),
    workflowRecordedAtIdx: index("route_decisions_workflow_recorded_at_idx").on(
      table.workflowId,
      table.recordedAt
    )
  })
);

export const routeProjectionSnapshotsTable = sqliteTable(
  "route_projection_snapshots",
  {
    workflowId: text("workflow_id").primaryKey(),
    eventSequence: integer("event_sequence").notNull(),
    currentNode: text("current_node"),
    terminal: integer("terminal", { mode: "boolean" }).notNull(),
    lastSignalId: text("last_signal_id"),
    lastDecisionId: text("last_decision_id"),
    projectionJson: text("projection_json", { mode: "json" }).notNull().$type<unknown>(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    workflowFk: foreignKey({
      columns: [table.workflowId],
      foreignColumns: [routeWorkflowsTable.workflowId],
      name: "route_projection_snapshots_workflow_fk"
    }).onDelete("cascade"),
    workflowEventFk: foreignKey({
      columns: [table.workflowId, table.eventSequence],
      foreignColumns: [routeHistoryEventsTable.workflowId, routeHistoryEventsTable.eventSequence],
      name: "route_projection_snapshots_workflow_event_fk"
    }).onDelete("cascade"),
    eventSequenceCheck: check(
      "route_projection_snapshots_event_sequence_check",
      sql`${table.eventSequence} >= 1`
    ),
    eventSequenceIdx: index("route_projection_snapshots_event_sequence_idx").on(
      table.eventSequence
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
    sourceKindCheck: check(
      "symphony_agent_task_snapshots_source_kind_check",
      sql`${table.sourceKind} in (${sqlEnum(taskSnapshotSourceKindValues)})`
    ),
    itemFk: foreignKey({
      columns: [table.runId, table.turnId, table.itemId],
      foreignColumns: [
        symphonyAgentItemsTable.runId,
        symphonyAgentItemsTable.turnId,
        symphonyAgentItemsTable.itemId
      ],
      name: "symphony_agent_task_snapshots_item_fk"
    }).onDelete("cascade"),
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
    stateCheck: check(
      "symphony_agent_task_snapshot_items_state_check",
      sql`${table.state} in (${sqlEnum(taskSnapshotStateValues)})`
    ),
    snapshotFk: foreignKey({
      columns: [table.snapshotId],
      foreignColumns: [symphonyAgentTaskSnapshotsTable.snapshotId],
      name: "symphony_agent_task_snapshot_items_snapshot_fk"
    }).onDelete("cascade"),
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
  piMessageEndsTable,
  symphonyAgentFileChangesTable,
  symphonyAgentTaskSnapshotsTable,
  symphonyAgentTaskSnapshotItemsTable,
  symphonyIssuesTable,
  symphonyRunsTable,
  symphonyTurnsTable,
  symphonyEventsTable,
  symphonyIssueTimelineTable,
  symphonyIssueDeliveryReportsTable,
  symphonyRuntimeLogsTable,
  symphonyRunRuntimeContextTable,
  routeWorkflowsTable,
  routeHistoryEventsTable,
  routeDecisionsTable,
  routeProjectionSnapshotsTable,
  symphonyGitHubIngressTable,
  symphonyMigrationStateTable
};
