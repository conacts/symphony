CREATE TABLE IF NOT EXISTS symphony_issues (
  issue_id TEXT PRIMARY KEY NOT NULL,
  repository_key TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  latest_run_started_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_issues_repository_issue_identifier_idx
  ON symphony_issues (repository_key, issue_identifier);

CREATE INDEX IF NOT EXISTS symphony_issues_repository_key_idx
  ON symphony_issues (repository_key);

CREATE INDEX IF NOT EXISTS symphony_issues_latest_run_started_at_idx
  ON symphony_issues (latest_run_started_at);

CREATE TABLE IF NOT EXISTS symphony_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  repository_key TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  attempt INTEGER,
  status TEXT NOT NULL,
  outcome TEXT,
  worker_host TEXT,
  workspace_path TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  commit_hash_start TEXT,
  commit_hash_end TEXT,
  repo_start TEXT,
  repo_end TEXT,
  metadata TEXT,
  error_class TEXT,
  error_message TEXT,
  machine_load_sample_count INTEGER,
  machine_load_max_cpu_percent INTEGER,
  machine_load_avg_cpu_percent INTEGER,
  machine_load_max_memory_percent INTEGER,
  machine_load_avg_memory_percent INTEGER,
  machine_load_max_disk_percent INTEGER,
  machine_load_avg_disk_percent INTEGER,
  machine_load_had_high_cpu INTEGER,
  machine_load_had_high_memory INTEGER,
  machine_load_had_high_disk INTEGER,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_runs_repository_key_idx
  ON symphony_runs (repository_key);

CREATE INDEX IF NOT EXISTS symphony_runs_issue_id_idx
  ON symphony_runs (issue_id);

CREATE INDEX IF NOT EXISTS symphony_runs_repository_issue_identifier_idx
  ON symphony_runs (repository_key, issue_identifier);

CREATE INDEX IF NOT EXISTS symphony_runs_started_at_idx
  ON symphony_runs (started_at);

CREATE TABLE IF NOT EXISTS symphony_turns (
  turn_id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  turn_sequence INTEGER NOT NULL,
  thread_id TEXT NOT NULL,
  agent_turn_id TEXT,
  prompt_text TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  usage TEXT,
  metadata TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_turns_run_id_idx
  ON symphony_turns (run_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_turns_run_sequence_idx
  ON symphony_turns (run_id, turn_sequence);

CREATE TABLE IF NOT EXISTS symphony_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  turn_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  event_sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  item_type TEXT,
  item_status TEXT,
  recorded_at TEXT NOT NULL,
  payload TEXT,
  payload_truncated INTEGER NOT NULL,
  payload_bytes INTEGER NOT NULL,
  summary TEXT,
  thread_id TEXT NOT NULL,
  agent_turn_id TEXT,
  inserted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_events_run_id_idx
  ON symphony_events (run_id);

CREATE INDEX IF NOT EXISTS symphony_events_turn_id_idx
  ON symphony_events (turn_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_events_turn_sequence_idx
  ON symphony_events (turn_id, event_sequence);

CREATE INDEX IF NOT EXISTS symphony_events_recorded_at_idx
  ON symphony_events (recorded_at);

CREATE TABLE IF NOT EXISTS symphony_issue_timeline_entries (
  entry_id TEXT PRIMARY KEY NOT NULL,
  repository_key TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  run_id TEXT,
  turn_id TEXT,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  payload TEXT,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_repository_issue_identifier_idx
  ON symphony_issue_timeline_entries (repository_key, issue_identifier);

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_repository_key_idx
  ON symphony_issue_timeline_entries (repository_key);

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_recorded_at_idx
  ON symphony_issue_timeline_entries (recorded_at);

CREATE TABLE IF NOT EXISTS symphony_runtime_logs (
  entry_id TEXT PRIMARY KEY NOT NULL,
  repository_key TEXT,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  issue_id TEXT,
  issue_identifier TEXT,
  run_id TEXT,
  payload TEXT,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_runtime_logs_repository_key_idx
  ON symphony_runtime_logs (repository_key);

CREATE INDEX IF NOT EXISTS symphony_runtime_logs_recorded_at_idx
  ON symphony_runtime_logs (recorded_at);

CREATE INDEX IF NOT EXISTS symphony_runtime_logs_repository_issue_identifier_idx
  ON symphony_runtime_logs (repository_key, issue_identifier);

CREATE TABLE IF NOT EXISTS symphony_github_ingress (
  delivery_id TEXT PRIMARY KEY NOT NULL,
  event TEXT NOT NULL,
  repository TEXT NOT NULL,
  action TEXT,
  semantic_key TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_github_ingress_semantic_key_idx
  ON symphony_github_ingress (semantic_key);

CREATE INDEX IF NOT EXISTS symphony_github_ingress_recorded_at_idx
  ON symphony_github_ingress (recorded_at);

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
  input_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  turn_count INTEGER NOT NULL,
  item_count INTEGER NOT NULL,
  command_count INTEGER NOT NULL,
  tool_call_count INTEGER NOT NULL,
  file_change_count INTEGER NOT NULL,
  agent_message_count INTEGER NOT NULL,
  reasoning_count INTEGER NOT NULL,
  error_count INTEGER NOT NULL,
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
  input_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  item_count INTEGER NOT NULL,
  command_count INTEGER NOT NULL,
  tool_call_count INTEGER NOT NULL,
  file_change_count INTEGER NOT NULL,
  agent_message_count INTEGER NOT NULL,
  reasoning_count INTEGER NOT NULL,
  error_count INTEGER NOT NULL,
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
  update_count INTEGER NOT NULL,
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
  timeout_seconds INTEGER,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  output_preview TEXT,
  output_overflow_id TEXT,
  resource_profile_json TEXT,
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
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS symphony_agent_messages_run_id_idx
  ON symphony_agent_messages (run_id);

CREATE INDEX IF NOT EXISTS symphony_agent_messages_run_recorded_at_idx
  ON symphony_agent_messages (run_id, recorded_at);

CREATE TABLE IF NOT EXISTS symphony_agent_reasoning (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  text_content TEXT,
  text_preview TEXT,
  text_overflow_id TEXT,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS symphony_agent_reasoning_run_id_idx
  ON symphony_agent_reasoning (run_id);

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
  snapshot_id TEXT PRIMARY KEY NOT NULL,
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

CREATE TABLE IF NOT EXISTS pi_reads (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  path TEXT NOT NULL,
  read_offset INTEGER,
  read_limit INTEGER,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS pi_reads_run_id_idx
  ON pi_reads (run_id);

CREATE INDEX IF NOT EXISTS pi_reads_path_idx
  ON pi_reads (path);

CREATE TABLE IF NOT EXISTS pi_edits (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  path TEXT NOT NULL,
  edit_count INTEGER NOT NULL,
  line_count INTEGER NOT NULL,
  first_changed_line INTEGER,
  diff_preview TEXT,
  diff_overflow_id TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS pi_edits_run_id_idx
  ON pi_edits (run_id);

CREATE INDEX IF NOT EXISTS pi_edits_path_idx
  ON pi_edits (path);

CREATE TABLE IF NOT EXISTS pi_writes (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  path TEXT NOT NULL,
  line_count INTEGER NOT NULL,
  content_bytes INTEGER NOT NULL,
  bytes_written INTEGER,
  diff_preview TEXT,
  diff_overflow_id TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS pi_writes_run_id_idx
  ON pi_writes (run_id);

CREATE INDEX IF NOT EXISTS pi_writes_path_idx
  ON pi_writes (path);

CREATE TABLE IF NOT EXISTS pi_greps (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  search_path TEXT,
  ignore_case INTEGER,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS pi_greps_run_id_idx
  ON pi_greps (run_id);

CREATE TABLE IF NOT EXISTS pi_finds (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  search_path TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS pi_finds_run_id_idx
  ON pi_finds (run_id);

CREATE TABLE IF NOT EXISTS pi_message_ends (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  response_id TEXT,
  api TEXT,
  provider TEXT,
  model TEXT,
  stop_reason TEXT,
  response_timestamp TEXT,
  input_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX IF NOT EXISTS pi_message_ends_run_id_idx
  ON pi_message_ends (run_id);

CREATE INDEX IF NOT EXISTS pi_message_ends_response_id_idx
  ON pi_message_ends (response_id);

CREATE INDEX IF NOT EXISTS pi_message_ends_model_idx
  ON pi_message_ends (model);

CREATE TABLE IF NOT EXISTS symphony_issue_delivery_reports (
  report_id TEXT PRIMARY KEY NOT NULL,
  repository_key TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  run_id TEXT NOT NULL,
  turn_id TEXT,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  pr_url TEXT,
  pr_number TEXT,
  branch_name TEXT,
  blocking_reason TEXT,
  tests_summary TEXT,
  source TEXT NOT NULL,
  payload_json TEXT,
  reported_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_issue_delivery_reports_repository_issue_identifier_idx
  ON symphony_issue_delivery_reports (repository_key, issue_identifier, reported_at);

CREATE INDEX IF NOT EXISTS symphony_issue_delivery_reports_repository_key_idx
  ON symphony_issue_delivery_reports (repository_key, reported_at);

CREATE INDEX IF NOT EXISTS symphony_issue_delivery_reports_run_id_idx
  ON symphony_issue_delivery_reports (run_id, reported_at);

CREATE INDEX IF NOT EXISTS symphony_issue_delivery_reports_status_idx
  ON symphony_issue_delivery_reports (status, reported_at);

CREATE TABLE IF NOT EXISTS symphony_run_runtime_context (
  run_id TEXT PRIMARY KEY NOT NULL,
  harness_kind TEXT,
  thread_id TEXT NOT NULL,
  process_id TEXT,
  model TEXT,
  reasoning_effort TEXT,
  profile TEXT,
  provider_id TEXT,
  provider_name TEXT,
  auth_mode TEXT,
  provider_env_key TEXT,
  launch_target_json TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_run_runtime_context_harness_kind_idx
  ON symphony_run_runtime_context (harness_kind);

CREATE INDEX IF NOT EXISTS symphony_run_runtime_context_thread_id_idx
  ON symphony_run_runtime_context (thread_id);
