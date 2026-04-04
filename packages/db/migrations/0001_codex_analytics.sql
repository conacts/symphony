CREATE TABLE IF NOT EXISTS codex_event_log (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  turn_id TEXT,
  thread_id TEXT,
  item_id TEXT,
  event_type TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  payload_json TEXT,
  payload_overflow_id TEXT,
  payload_truncated INTEGER NOT NULL,
  inserted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS codex_event_log_run_sequence_idx
  ON codex_event_log (run_id, sequence);

CREATE INDEX IF NOT EXISTS codex_event_log_run_turn_sequence_idx
  ON codex_event_log (run_id, turn_id, sequence);

CREATE INDEX IF NOT EXISTS codex_event_log_run_item_sequence_idx
  ON codex_event_log (run_id, item_id, sequence);

CREATE INDEX IF NOT EXISTS codex_event_log_thread_sequence_idx
  ON codex_event_log (thread_id, sequence);

CREATE INDEX IF NOT EXISTS codex_event_log_event_recorded_at_idx
  ON codex_event_log (event_type, recorded_at);

CREATE TABLE IF NOT EXISTS codex_payload_overflow (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  run_id TEXT NOT NULL,
  turn_id TEXT,
  item_id TEXT,
  content_json TEXT,
  content_text TEXT,
  byte_count INTEGER NOT NULL,
  inserted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS codex_payload_overflow_run_inserted_at_idx
  ON codex_payload_overflow (run_id, inserted_at);

CREATE INDEX IF NOT EXISTS codex_payload_overflow_turn_inserted_at_idx
  ON codex_payload_overflow (turn_id, inserted_at);

CREATE INDEX IF NOT EXISTS codex_payload_overflow_item_inserted_at_idx
  ON codex_payload_overflow (item_id, inserted_at);

CREATE INDEX IF NOT EXISTS codex_payload_overflow_kind_inserted_at_idx
  ON codex_payload_overflow (kind, inserted_at);

CREATE TABLE IF NOT EXISTS codex_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT,
  issue_id TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  status TEXT NOT NULL,
  failure_kind TEXT,
  failure_origin TEXT,
  failure_message_preview TEXT,
  final_turn_id TEXT,
  last_agent_message_item_id TEXT,
  last_agent_message_preview TEXT,
  last_agent_message_overflow_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  turn_count INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  command_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  file_change_count INTEGER NOT NULL DEFAULT 0,
  agent_message_count INTEGER NOT NULL DEFAULT 0,
  reasoning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  latest_event_at TEXT,
  latest_event_type TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS codex_runs_issue_id_idx
  ON codex_runs (issue_id);

CREATE INDEX IF NOT EXISTS codex_runs_issue_identifier_idx
  ON codex_runs (issue_identifier);

CREATE INDEX IF NOT EXISTS codex_runs_started_at_idx
  ON codex_runs (started_at);

CREATE INDEX IF NOT EXISTS codex_runs_thread_id_idx
  ON codex_runs (thread_id);

CREATE TABLE IF NOT EXISTS codex_turns (
  turn_id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  thread_id TEXT,
  started_at TEXT,
  ended_at TEXT,
  status TEXT NOT NULL,
  failure_kind TEXT,
  failure_message_preview TEXT,
  last_agent_message_item_id TEXT,
  last_agent_message_preview TEXT,
  last_agent_message_overflow_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  command_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  file_change_count INTEGER NOT NULL DEFAULT 0,
  agent_message_count INTEGER NOT NULL DEFAULT 0,
  reasoning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  latest_event_at TEXT,
  latest_event_type TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS codex_turns_run_id_idx
  ON codex_turns (run_id);

CREATE INDEX IF NOT EXISTS codex_turns_started_at_idx
  ON codex_turns (started_at);

CREATE TABLE IF NOT EXISTS codex_items (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  started_at TEXT,
  last_updated_at TEXT,
  completed_at TEXT,
  final_status TEXT,
  update_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  latest_preview TEXT,
  latest_overflow_id TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS codex_items_run_id_idx
  ON codex_items (run_id);

CREATE INDEX IF NOT EXISTS codex_items_turn_id_idx
  ON codex_items (turn_id);

CREATE INDEX IF NOT EXISTS codex_items_item_type_idx
  ON codex_items (item_type);

CREATE TABLE IF NOT EXISTS codex_command_executions (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  output_preview TEXT,
  output_overflow_id TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS codex_command_executions_run_id_idx
  ON codex_command_executions (run_id);

CREATE INDEX IF NOT EXISTS codex_command_executions_status_idx
  ON codex_command_executions (status);

CREATE TABLE IF NOT EXISTS codex_tool_calls (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  server TEXT NOT NULL,
  tool TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  arguments_json TEXT,
  result_preview TEXT,
  result_overflow_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS codex_tool_calls_run_id_idx
  ON codex_tool_calls (run_id);

CREATE INDEX IF NOT EXISTS codex_tool_calls_tool_idx
  ON codex_tool_calls (server, tool);

CREATE TABLE IF NOT EXISTS codex_agent_messages (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  text_content TEXT,
  text_preview TEXT,
  text_overflow_id TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS codex_agent_messages_run_id_idx
  ON codex_agent_messages (run_id);

CREATE TABLE IF NOT EXISTS codex_reasoning (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  text_content TEXT,
  text_preview TEXT,
  text_overflow_id TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS codex_reasoning_run_id_idx
  ON codex_reasoning (run_id);

CREATE TABLE IF NOT EXISTS codex_file_changes (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  path TEXT NOT NULL,
  change_kind TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id, path)
);

CREATE INDEX IF NOT EXISTS codex_file_changes_run_id_idx
  ON codex_file_changes (run_id);

CREATE INDEX IF NOT EXISTS codex_file_changes_path_idx
  ON codex_file_changes (path);
