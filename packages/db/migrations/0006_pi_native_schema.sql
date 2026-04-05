ALTER TABLE symphony_turns ADD COLUMN thread_id TEXT;
ALTER TABLE symphony_turns ADD COLUMN agent_turn_id TEXT;
ALTER TABLE symphony_turns ADD COLUMN session_id TEXT;

UPDATE symphony_turns
SET thread_id = codex_thread_id
WHERE thread_id IS NULL;

UPDATE symphony_turns
SET agent_turn_id = codex_turn_id
WHERE agent_turn_id IS NULL;

UPDATE symphony_turns
SET session_id = codex_session_id
WHERE session_id IS NULL;

ALTER TABLE symphony_events ADD COLUMN thread_id TEXT;
ALTER TABLE symphony_events ADD COLUMN agent_turn_id TEXT;
ALTER TABLE symphony_events ADD COLUMN session_id TEXT;

UPDATE symphony_events
SET thread_id = codex_thread_id
WHERE thread_id IS NULL;

UPDATE symphony_events
SET agent_turn_id = codex_turn_id
WHERE agent_turn_id IS NULL;

UPDATE symphony_events
SET session_id = codex_session_id
WHERE session_id IS NULL;

CREATE TABLE IF NOT EXISTS symphony_agent_event_log (
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
  projection_loss_overflow_id TEXT,
  raw_payload_overflow_id TEXT,
  payload_truncated INTEGER NOT NULL,
  inserted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_agent_event_log_run_sequence_idx
  ON symphony_agent_event_log (run_id, sequence);
CREATE INDEX IF NOT EXISTS symphony_agent_event_log_run_turn_sequence_idx
  ON symphony_agent_event_log (run_id, turn_id, sequence);
CREATE INDEX IF NOT EXISTS symphony_agent_event_log_run_item_sequence_idx
  ON symphony_agent_event_log (run_id, item_id, sequence);
CREATE INDEX IF NOT EXISTS symphony_agent_event_log_thread_sequence_idx
  ON symphony_agent_event_log (thread_id, sequence);
CREATE INDEX IF NOT EXISTS symphony_agent_event_log_event_recorded_at_idx
  ON symphony_agent_event_log (event_type, recorded_at);

CREATE TABLE IF NOT EXISTS symphony_agent_payload_overflow (
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

CREATE INDEX IF NOT EXISTS symphony_agent_payload_overflow_run_inserted_at_idx
  ON symphony_agent_payload_overflow (run_id, inserted_at);
CREATE INDEX IF NOT EXISTS symphony_agent_payload_overflow_turn_inserted_at_idx
  ON symphony_agent_payload_overflow (turn_id, inserted_at);
CREATE INDEX IF NOT EXISTS symphony_agent_payload_overflow_item_inserted_at_idx
  ON symphony_agent_payload_overflow (item_id, inserted_at);
CREATE INDEX IF NOT EXISTS symphony_agent_payload_overflow_kind_inserted_at_idx
  ON symphony_agent_payload_overflow (kind, inserted_at);

CREATE TABLE IF NOT EXISTS symphony_agent_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT,
  harness_kind TEXT,
  model TEXT,
  provider_id TEXT,
  provider_name TEXT,
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

CREATE INDEX IF NOT EXISTS symphony_agent_runs_issue_id_idx
  ON symphony_agent_runs (issue_id);
CREATE INDEX IF NOT EXISTS symphony_agent_runs_issue_identifier_idx
  ON symphony_agent_runs (issue_identifier);
CREATE INDEX IF NOT EXISTS symphony_agent_runs_started_at_idx
  ON symphony_agent_runs (started_at);
CREATE INDEX IF NOT EXISTS symphony_agent_runs_thread_id_idx
  ON symphony_agent_runs (thread_id);

CREATE TABLE IF NOT EXISTS symphony_agent_turns (
  turn_id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  thread_id TEXT,
  harness_kind TEXT,
  model TEXT,
  provider_id TEXT,
  provider_name TEXT,
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

CREATE INDEX IF NOT EXISTS symphony_agent_turns_run_id_idx
  ON symphony_agent_turns (run_id);
CREATE INDEX IF NOT EXISTS symphony_agent_turns_started_at_idx
  ON symphony_agent_turns (started_at);

CREATE TABLE IF NOT EXISTS symphony_agent_items (
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

CREATE INDEX IF NOT EXISTS symphony_agent_items_run_id_idx
  ON symphony_agent_items (run_id);
CREATE INDEX IF NOT EXISTS symphony_agent_items_turn_id_idx
  ON symphony_agent_items (turn_id);
CREATE INDEX IF NOT EXISTS symphony_agent_items_item_type_idx
  ON symphony_agent_items (item_type);

CREATE TABLE IF NOT EXISTS symphony_agent_command_executions (
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

CREATE INDEX IF NOT EXISTS symphony_agent_command_executions_run_id_idx
  ON symphony_agent_command_executions (run_id);
CREATE INDEX IF NOT EXISTS symphony_agent_command_executions_status_idx
  ON symphony_agent_command_executions (status);

CREATE TABLE IF NOT EXISTS symphony_agent_tool_calls (
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

CREATE INDEX IF NOT EXISTS symphony_agent_tool_calls_run_id_idx
  ON symphony_agent_tool_calls (run_id);
CREATE INDEX IF NOT EXISTS symphony_agent_tool_calls_tool_idx
  ON symphony_agent_tool_calls (server, tool);

CREATE TABLE IF NOT EXISTS symphony_agent_messages (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  text_content TEXT,
  text_preview TEXT,
  text_overflow_id TEXT,
  recorded_at TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS symphony_agent_messages_run_id_idx
  ON symphony_agent_messages (run_id);
CREATE INDEX IF NOT EXISTS symphony_agent_messages_recorded_at_idx
  ON symphony_agent_messages (recorded_at);
CREATE INDEX IF NOT EXISTS symphony_agent_messages_run_recorded_at_idx
  ON symphony_agent_messages (run_id, recorded_at);

CREATE TABLE IF NOT EXISTS symphony_agent_reasoning (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  text_content TEXT,
  text_preview TEXT,
  text_overflow_id TEXT,
  recorded_at TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS symphony_agent_reasoning_run_id_idx
  ON symphony_agent_reasoning (run_id);
CREATE INDEX IF NOT EXISTS symphony_agent_reasoning_recorded_at_idx
  ON symphony_agent_reasoning (recorded_at);
CREATE INDEX IF NOT EXISTS symphony_agent_reasoning_run_recorded_at_idx
  ON symphony_agent_reasoning (run_id, recorded_at);

CREATE TABLE IF NOT EXISTS symphony_agent_file_changes (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  path TEXT NOT NULL,
  change_kind TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id, path)
);

CREATE INDEX IF NOT EXISTS symphony_agent_file_changes_run_id_idx
  ON symphony_agent_file_changes (run_id);
CREATE INDEX IF NOT EXISTS symphony_agent_file_changes_path_idx
  ON symphony_agent_file_changes (path);

CREATE TABLE IF NOT EXISTS symphony_agent_task_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_agent_task_snapshots_run_id_idx
  ON symphony_agent_task_snapshots (run_id);
CREATE INDEX IF NOT EXISTS symphony_agent_task_snapshots_turn_id_idx
  ON symphony_agent_task_snapshots (turn_id);
CREATE INDEX IF NOT EXISTS symphony_agent_task_snapshots_item_id_idx
  ON symphony_agent_task_snapshots (item_id);
CREATE INDEX IF NOT EXISTS symphony_agent_task_snapshots_recorded_at_idx
  ON symphony_agent_task_snapshots (recorded_at);

CREATE TABLE IF NOT EXISTS symphony_agent_task_snapshot_items (
  snapshot_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  state TEXT NOT NULL,
  section TEXT,
  inserted_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_agent_task_snapshot_items_pk
  ON symphony_agent_task_snapshot_items (snapshot_id, position);
CREATE INDEX IF NOT EXISTS symphony_agent_task_snapshot_items_snapshot_id_idx
  ON symphony_agent_task_snapshot_items (snapshot_id);
CREATE INDEX IF NOT EXISTS symphony_agent_task_snapshot_items_state_idx
  ON symphony_agent_task_snapshot_items (state);

INSERT INTO symphony_agent_event_log
SELECT id, run_id, turn_id, thread_id, item_id, event_type, sequence, recorded_at, payload_json, payload_overflow_id, projection_loss_overflow_id, raw_payload_overflow_id, payload_truncated, inserted_at
FROM codex_event_log;

INSERT INTO symphony_agent_payload_overflow
SELECT id, kind, run_id, turn_id, item_id, content_json, content_text, byte_count, inserted_at
FROM codex_payload_overflow;

INSERT INTO symphony_agent_runs
SELECT run_id, thread_id, harness_kind, model, provider_id, provider_name, issue_id, issue_identifier, started_at, ended_at, status, failure_kind, failure_origin, failure_message_preview, final_turn_id, last_agent_message_item_id, last_agent_message_preview, last_agent_message_overflow_id, input_tokens, cached_input_tokens, output_tokens, turn_count, item_count, command_count, tool_call_count, file_change_count, agent_message_count, reasoning_count, error_count, latest_event_at, latest_event_type, inserted_at, updated_at
FROM codex_runs;

INSERT INTO symphony_agent_turns
SELECT turn_id, run_id, thread_id, harness_kind, model, provider_id, provider_name, started_at, ended_at, status, failure_kind, failure_message_preview, last_agent_message_item_id, last_agent_message_preview, last_agent_message_overflow_id, input_tokens, cached_input_tokens, output_tokens, item_count, command_count, tool_call_count, file_change_count, agent_message_count, reasoning_count, error_count, latest_event_at, latest_event_type, inserted_at, updated_at
FROM codex_turns;

INSERT INTO symphony_agent_items
SELECT run_id, turn_id, item_id, item_type, started_at, last_updated_at, completed_at, final_status, update_count, duration_ms, latest_preview, latest_overflow_id, inserted_at, updated_at
FROM codex_items;

INSERT INTO symphony_agent_command_executions
SELECT run_id, turn_id, item_id, command, status, exit_code, started_at, completed_at, duration_ms, output_preview, output_overflow_id, inserted_at, updated_at
FROM codex_command_executions;

INSERT INTO symphony_agent_tool_calls
SELECT run_id, turn_id, item_id, server, tool, status, error_message, arguments_json, result_preview, result_overflow_id, started_at, completed_at, duration_ms, inserted_at, updated_at
FROM codex_tool_calls;

INSERT INTO symphony_agent_messages
SELECT run_id, turn_id, item_id, text_content, text_preview, text_overflow_id, recorded_at, inserted_at, updated_at
FROM codex_agent_messages;

INSERT INTO symphony_agent_reasoning
SELECT run_id, turn_id, item_id, text_content, text_preview, text_overflow_id, recorded_at, inserted_at, updated_at
FROM codex_reasoning;

INSERT INTO symphony_agent_file_changes
SELECT run_id, turn_id, item_id, path, change_kind, recorded_at, inserted_at
FROM codex_file_changes;

INSERT INTO symphony_agent_task_snapshots
SELECT snapshot_id, run_id, turn_id, item_id, source_kind, recorded_at, inserted_at
FROM codex_task_snapshots;

INSERT INTO symphony_agent_task_snapshot_items
SELECT snapshot_id, position, label, state, section, inserted_at
FROM codex_task_snapshot_items;

DROP TABLE codex_task_snapshot_items;
DROP TABLE codex_task_snapshots;
DROP TABLE codex_file_changes;
DROP TABLE codex_reasoning;
DROP TABLE codex_agent_messages;
DROP TABLE codex_tool_calls;
DROP TABLE codex_command_executions;
DROP TABLE codex_items;
DROP TABLE codex_turns;
DROP TABLE codex_runs;
DROP TABLE codex_payload_overflow;
DROP TABLE codex_event_log;
