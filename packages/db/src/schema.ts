import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    codexThreadId: text("codex_thread_id"),
    codexTurnId: text("codex_turn_id"),
    codexSessionId: text("codex_session_id"),
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
    codexThreadId: text("codex_thread_id"),
    codexTurnId: text("codex_turn_id"),
    codexSessionId: text("codex_session_id"),
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

export const symphonySchema = {
  symphonyIssuesTable,
  symphonyRunsTable,
  symphonyTurnsTable,
  symphonyEventsTable,
  symphonyIssueTimelineTable,
  symphonyRuntimeLogsTable,
  symphonyGitHubIngressTable,
  symphonyMigrationStateTable
};
