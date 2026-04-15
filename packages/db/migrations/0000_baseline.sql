CREATE TABLE IF NOT EXISTS symphony_issues (
  tracker_issue_id TEXT PRIMARY KEY NOT NULL,
  issue_identifier TEXT NOT NULL,
  repository_key TEXT NOT NULL,
  organization_id TEXT,
  linear_workspace_identity_id TEXT,
  repository_workspace_binding_id TEXT,
  latest_run_started_at TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (organization_id IS NULL OR length(trim(organization_id)) > 0),
  CHECK (
    linear_workspace_identity_id IS NULL OR
    length(trim(linear_workspace_identity_id)) > 0
  ),
  CHECK (
    repository_workspace_binding_id IS NULL OR
    length(trim(repository_workspace_binding_id)) > 0
  ),
  CHECK (
    (organization_id IS NULL AND linear_workspace_identity_id IS NULL) OR
    (organization_id IS NOT NULL AND linear_workspace_identity_id IS NOT NULL)
  ),
  CHECK (
    repository_workspace_binding_id IS NULL OR
    (organization_id IS NOT NULL AND linear_workspace_identity_id IS NOT NULL)
  ),
  FOREIGN KEY (
    organization_id,
    repository_workspace_binding_id,
    linear_workspace_identity_id
  )
    REFERENCES symphony_repository_workspace_bindings(
      organization_id,
      repository_workspace_binding_id,
      linear_workspace_identity_id
    )
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_issues_issue_identifier_idx
  ON symphony_issues (issue_identifier);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_issues_issue_repository_key_idx
  ON symphony_issues (issue_identifier, repository_key);

CREATE INDEX IF NOT EXISTS symphony_issues_repository_key_idx
  ON symphony_issues (repository_key);

CREATE INDEX IF NOT EXISTS symphony_issues_organization_id_idx
  ON symphony_issues (organization_id);

CREATE INDEX IF NOT EXISTS symphony_issues_linear_workspace_identity_id_idx
  ON symphony_issues (linear_workspace_identity_id);

CREATE INDEX IF NOT EXISTS symphony_issues_repository_workspace_binding_id_idx
  ON symphony_issues (repository_workspace_binding_id);

CREATE INDEX IF NOT EXISTS symphony_issues_latest_run_started_at_idx
  ON symphony_issues (latest_run_started_at);

CREATE TABLE IF NOT EXISTS symphony_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  repository_key TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  organization_id TEXT,
  linear_workspace_identity_id TEXT,
  attempt INTEGER,
  run_mode TEXT NOT NULL CHECK (
    run_mode IN (
      'implementation'
    )
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'dispatching',
      'running',
      'finished',
      'paused',
      'failed',
      'startup_failed',
      'rate_limited',
      'stalled',
      'stopped'
    )
  ),
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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (issue_identifier, repository_key) REFERENCES symphony_issues(issue_identifier, repository_key) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (organization_id IS NULL OR length(trim(organization_id)) > 0),
  CHECK (
    linear_workspace_identity_id IS NULL OR
    length(trim(linear_workspace_identity_id)) > 0
  ),
  CHECK (
    (organization_id IS NULL AND linear_workspace_identity_id IS NULL) OR
    (organization_id IS NOT NULL AND linear_workspace_identity_id IS NOT NULL)
  ),
  CHECK (attempt IS NULL OR attempt >= 1),
  CHECK (
    outcome IS NULL OR outcome IN (
      'completed',
      'merged',
      'blocked',
      'merge_blocked',
      'paused_max_turns',
      'startup_failed',
      'rate_limited',
      'provider_transient',
      'stalled',
      'failed',
      'runtime_shutdown',
      'run_stopped_inactive',
      'run_stopped_terminal'
    )
  )
);

CREATE INDEX IF NOT EXISTS symphony_runs_repository_key_idx
  ON symphony_runs (repository_key);

CREATE INDEX IF NOT EXISTS symphony_runs_organization_id_idx
  ON symphony_runs (organization_id);

CREATE INDEX IF NOT EXISTS symphony_runs_linear_workspace_identity_id_idx
  ON symphony_runs (linear_workspace_identity_id);

CREATE INDEX IF NOT EXISTS symphony_runs_issue_identifier_idx
  ON symphony_runs (issue_identifier);

CREATE INDEX IF NOT EXISTS symphony_runs_started_at_idx
  ON symphony_runs (started_at);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_runs_issue_run_id_idx
  ON symphony_runs (issue_identifier, run_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_runs_one_active_unscoped_run_per_issue_idx
  ON symphony_runs (issue_identifier)
  WHERE
    status IN ('dispatching', 'running') AND
    organization_id IS NULL AND
    linear_workspace_identity_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS symphony_runs_one_active_scoped_run_per_issue_idx
  ON symphony_runs (
    organization_id,
    linear_workspace_identity_id,
    issue_identifier
  )
  WHERE
    status IN ('dispatching', 'running') AND
    organization_id IS NOT NULL AND
    linear_workspace_identity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS symphony_turns (
  turn_id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  turn_sequence INTEGER NOT NULL,
  thread_id TEXT NOT NULL,
  agent_turn_id TEXT,
  prompt_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'stopped')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  usage TEXT,
  metadata TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES symphony_runs(run_id) ON DELETE CASCADE,
  CHECK (turn_sequence >= 1)
);

CREATE INDEX IF NOT EXISTS symphony_turns_run_id_idx
  ON symphony_turns (run_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_turns_run_turn_id_idx
  ON symphony_turns (run_id, turn_id);

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
  payload_truncated INTEGER NOT NULL CHECK (payload_truncated IN (0, 1)),
  payload_bytes INTEGER NOT NULL,
  summary TEXT,
  thread_id TEXT NOT NULL,
  agent_turn_id TEXT,
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (run_id, turn_id) REFERENCES symphony_turns(run_id, turn_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES symphony_runs(run_id) ON DELETE CASCADE,
  CHECK (event_sequence >= 1),
  CHECK (payload_bytes >= 0),
  CHECK (
    item_type IS NULL OR item_type IN (
      'agent_message',
      'reasoning',
      'command_execution',
      'file_change',
      'mcp_tool_call',
      'web_search',
      'todo_list',
      'error'
    )
  ),
  CHECK (
    item_status IS NULL OR item_status IN (
      'in_progress',
      'completed',
      'failed'
    )
  )
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
  issue_identifier TEXT NOT NULL,
  run_id TEXT,
  turn_id TEXT,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  payload TEXT,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (issue_identifier) REFERENCES symphony_issues(issue_identifier) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (run_id) REFERENCES symphony_runs(run_id) ON DELETE SET NULL,
  FOREIGN KEY (turn_id) REFERENCES symphony_turns(turn_id) ON DELETE SET NULL,
  FOREIGN KEY (run_id, turn_id) REFERENCES symphony_turns(run_id, turn_id) ON DELETE SET NULL,
  CHECK (source IN ('orchestrator', 'agent', 'tracker', 'workspace', 'runtime')),
  CHECK (turn_id IS NULL OR run_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_issue_identifier_idx
  ON symphony_issue_timeline_entries (issue_identifier);

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_run_id_idx
  ON symphony_issue_timeline_entries (run_id);

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_recorded_at_idx
  ON symphony_issue_timeline_entries (recorded_at);

CREATE TABLE IF NOT EXISTS symphony_runtime_logs (
  entry_id TEXT PRIMARY KEY NOT NULL,
  repository_key TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  issue_identifier TEXT,
  run_id TEXT,
  payload TEXT,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (issue_identifier, repository_key)
    REFERENCES symphony_issues(issue_identifier, repository_key)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (run_id) REFERENCES symphony_runs(run_id) ON DELETE SET NULL,
  CHECK (level IN ('debug', 'info', 'warn', 'error'))
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
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES symphony_runs(run_id) ON DELETE CASCADE,
  CHECK (payload_truncated IN (0, 1)),
  CHECK (sequence >= 1)
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
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES symphony_runs(run_id) ON DELETE CASCADE,
  CHECK (
    kind IN (
      'agent_message',
      'command_output',
      'event_payload',
      'projection_losses',
      'raw_harness_payload',
      'reasoning',
      'tool_result'
    )
  ),
  CHECK (byte_count >= 0)
);

CREATE INDEX IF NOT EXISTS symphony_agent_payload_overflow_run_inserted_at_idx
  ON symphony_agent_payload_overflow (run_id, inserted_at);

CREATE INDEX IF NOT EXISTS symphony_agent_payload_overflow_turn_inserted_at_idx
  ON symphony_agent_payload_overflow (turn_id, inserted_at);

CREATE INDEX IF NOT EXISTS symphony_agent_payload_overflow_item_inserted_at_idx
  ON symphony_agent_payload_overflow (item_id, inserted_at);

CREATE INDEX IF NOT EXISTS symphony_agent_payload_overflow_kind_inserted_at_idx
  ON symphony_agent_payload_overflow (kind, inserted_at);

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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id) REFERENCES symphony_turns(run_id, turn_id) ON DELETE CASCADE,
  CHECK (
    item_type IN (
      'agent_message',
      'reasoning',
      'command_execution',
      'file_change',
      'mcp_tool_call',
      'web_search',
      'todo_list',
      'error'
    )
  ),
  CHECK (
    final_status IS NULL OR final_status IN (
      'in_progress',
      'completed',
      'failed'
    )
  ),
  CHECK (update_count >= 1)
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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_items(run_id, turn_id, item_id) ON DELETE CASCADE,
  CHECK (status IN ('in_progress', 'completed', 'failed'))
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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_items(run_id, turn_id, item_id) ON DELETE CASCADE,
  CHECK (status IN ('in_progress', 'completed', 'failed'))
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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_items(run_id, turn_id, item_id) ON DELETE CASCADE
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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_items(run_id, turn_id, item_id) ON DELETE CASCADE
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
  PRIMARY KEY (run_id, turn_id, item_id, path),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_items(run_id, turn_id, item_id) ON DELETE CASCADE,
  CHECK (change_kind IN ('add', 'delete', 'update'))
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
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_items(run_id, turn_id, item_id) ON DELETE CASCADE,
  CHECK (source_kind IN ('pi_queue_update', 'todo_list_projection'))
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
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES symphony_agent_task_snapshots(snapshot_id) ON DELETE CASCADE,
  CHECK (state IN ('pending', 'in_progress', 'completed', 'cancelled'))
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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_tool_calls(run_id, turn_id, item_id) ON DELETE CASCADE
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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_tool_calls(run_id, turn_id, item_id) ON DELETE CASCADE
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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_tool_calls(run_id, turn_id, item_id) ON DELETE CASCADE
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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_tool_calls(run_id, turn_id, item_id) ON DELETE CASCADE,
  CHECK (ignore_case IS NULL OR ignore_case IN (0, 1))
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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_tool_calls(run_id, turn_id, item_id) ON DELETE CASCADE
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
  PRIMARY KEY (run_id, turn_id, item_id),
  FOREIGN KEY (run_id, turn_id, item_id) REFERENCES symphony_agent_items(run_id, turn_id, item_id) ON DELETE CASCADE,
  CHECK (input_tokens >= 0),
  CHECK (cached_input_tokens >= 0),
  CHECK (cache_write_tokens IS NULL OR cache_write_tokens >= 0),
  CHECK (output_tokens >= 0),
  CHECK (total_tokens >= 0)
);

CREATE INDEX IF NOT EXISTS pi_message_ends_run_id_idx
  ON pi_message_ends (run_id);

CREATE INDEX IF NOT EXISTS pi_message_ends_response_id_idx
  ON pi_message_ends (response_id);

CREATE INDEX IF NOT EXISTS pi_message_ends_model_idx
  ON pi_message_ends (model);

CREATE TABLE IF NOT EXISTS symphony_issue_delivery_reports (
  report_id TEXT PRIMARY KEY NOT NULL,
  issue_identifier TEXT NOT NULL,
  run_id TEXT NOT NULL,
  turn_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed', 'blocked', 'partial')),
  summary TEXT NOT NULL,
  pr_url TEXT,
  pr_number TEXT,
  branch_name TEXT,
  blocking_reason TEXT,
  tests_summary TEXT,
  source TEXT NOT NULL,
  payload_json TEXT,
  reported_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (issue_identifier, run_id)
    REFERENCES symphony_runs(issue_identifier, run_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  FOREIGN KEY (run_id, turn_id) REFERENCES symphony_turns(run_id, turn_id) ON DELETE CASCADE,
  CHECK (source IN ('pi', 'runtime')),
  CHECK (status != 'completed' OR pr_url IS NOT NULL),
  CHECK (status != 'blocked' OR blocking_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS symphony_issue_delivery_reports_issue_identifier_idx
  ON symphony_issue_delivery_reports (issue_identifier, reported_at);

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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES symphony_runs(run_id) ON DELETE CASCADE,
  CHECK (harness_kind IS NULL OR harness_kind IN ('pi')),
  CHECK (auth_mode IS NULL OR auth_mode IN ('auth_json', 'api_key_env')),
  CHECK (length(trim(thread_id)) > 0)
);

CREATE INDEX IF NOT EXISTS symphony_run_runtime_context_harness_kind_idx
  ON symphony_run_runtime_context (harness_kind);

CREATE INDEX IF NOT EXISTS symphony_run_runtime_context_thread_id_idx
  ON symphony_run_runtime_context (thread_id);

CREATE TABLE IF NOT EXISTS route_workflows (
  workflow_id TEXT PRIMARY KEY NOT NULL,
  tracker_issue_id TEXT NOT NULL,
  router_preset_id TEXT NOT NULL,
  router_name TEXT NOT NULL,
  router_version TEXT NOT NULL,
  archived_at TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tracker_issue_id)
    REFERENCES symphony_issues(tracker_issue_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CHECK (length(trim(tracker_issue_id)) > 0)
);

CREATE INDEX IF NOT EXISTS route_workflows_tracker_issue_id_idx
  ON route_workflows (tracker_issue_id);

CREATE UNIQUE INDEX IF NOT EXISTS route_workflows_live_tracker_issue_idx
  ON route_workflows (tracker_issue_id)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS route_history_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  workflow_id TEXT NOT NULL,
  event_sequence INTEGER NOT NULL,
  kind TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  signal_id TEXT,
  signal_type TEXT,
  signal_source TEXT,
  decision_id TEXT,
  command_id TEXT,
  from_node TEXT,
  to_node TEXT,
  edge_id TEXT,
  reason_code TEXT,
  event_json TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (workflow_id)
    REFERENCES route_workflows(workflow_id)
    ON DELETE CASCADE,
  CHECK (event_sequence >= 1),
  CHECK (kind IN ('signal_recorded', 'decision_recorded', 'command_emitted', 'command_settled')),
  CHECK (signal_source IS NULL OR signal_source IN ('tracker', 'runtime', 'review', 'ci', 'operator', 'router')),
  CHECK (
    kind != 'signal_recorded' OR (
      signal_id IS NOT NULL AND
      signal_type IS NOT NULL AND
      signal_source IS NOT NULL AND
      decision_id IS NULL AND
      command_id IS NULL AND
      from_node IS NULL AND
      to_node IS NULL AND
      edge_id IS NULL AND
      reason_code IS NULL
    )
  ),
  CHECK (
    kind != 'decision_recorded' OR (
      signal_id IS NULL AND
      signal_type IS NULL AND
      signal_source IS NULL AND
      decision_id IS NOT NULL AND
      command_id IS NULL AND
      reason_code IS NOT NULL
    )
  ),
  CHECK (
    kind != 'command_emitted' OR (
      signal_id IS NULL AND
      signal_type IS NULL AND
      signal_source IS NULL AND
      decision_id IS NOT NULL AND
      command_id IS NOT NULL AND
      from_node IS NULL AND
      to_node IS NULL AND
      edge_id IS NULL AND
      reason_code IS NULL
    )
  ),
  CHECK (
    kind != 'command_settled' OR (
      signal_id IS NULL AND
      signal_type IS NULL AND
      signal_source IS NULL AND
      decision_id IS NULL AND
      command_id IS NOT NULL AND
      from_node IS NULL AND
      to_node IS NULL AND
      edge_id IS NULL AND
      reason_code IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS route_history_events_workflow_sequence_idx
  ON route_history_events (workflow_id, event_sequence);

CREATE UNIQUE INDEX IF NOT EXISTS route_history_events_workflow_signal_id_idx
  ON route_history_events (workflow_id, signal_id)
  WHERE signal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS route_history_events_workflow_decision_id_idx
  ON route_history_events (workflow_id, decision_id)
  WHERE decision_id IS NOT NULL
    AND kind = 'decision_recorded';

CREATE UNIQUE INDEX IF NOT EXISTS route_history_events_workflow_command_id_idx
  ON route_history_events (workflow_id, command_id)
  WHERE command_id IS NOT NULL
    AND kind = 'command_emitted';

CREATE UNIQUE INDEX IF NOT EXISTS route_history_events_workflow_command_settlement_id_idx
  ON route_history_events (workflow_id, command_id)
  WHERE command_id IS NOT NULL
    AND kind = 'command_settled';

CREATE INDEX IF NOT EXISTS route_history_events_workflow_recorded_at_idx
  ON route_history_events (workflow_id, recorded_at);

CREATE TABLE IF NOT EXISTS route_decisions (
  decision_id TEXT PRIMARY KEY NOT NULL,
  workflow_id TEXT NOT NULL,
  event_sequence INTEGER NOT NULL,
  signal_id TEXT NOT NULL,
  from_node TEXT,
  to_node TEXT,
  edge_id TEXT,
  reason_code TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  projection_before_json TEXT NOT NULL,
  projection_after_json TEXT NOT NULL,
  commands_json TEXT NOT NULL,
  trace_json TEXT NOT NULL,
  selection_metadata_json TEXT,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (workflow_id)
    REFERENCES route_workflows(workflow_id)
    ON DELETE CASCADE,
  FOREIGN KEY (workflow_id, event_sequence)
    REFERENCES route_history_events(workflow_id, event_sequence)
    ON DELETE CASCADE,
  CHECK (event_sequence >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS route_decisions_workflow_event_sequence_idx
  ON route_decisions (workflow_id, event_sequence);

CREATE UNIQUE INDEX IF NOT EXISTS route_decisions_workflow_signal_id_idx
  ON route_decisions (workflow_id, signal_id);

CREATE INDEX IF NOT EXISTS route_decisions_workflow_recorded_at_idx
  ON route_decisions (workflow_id, recorded_at);

CREATE TABLE IF NOT EXISTS route_projection_snapshots (
  workflow_id TEXT PRIMARY KEY NOT NULL,
  event_sequence INTEGER NOT NULL,
  current_node TEXT,
  terminal INTEGER NOT NULL,
  last_signal_id TEXT,
  last_decision_id TEXT,
  projection_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workflow_id)
    REFERENCES route_workflows(workflow_id)
    ON DELETE CASCADE,
  FOREIGN KEY (workflow_id, event_sequence)
    REFERENCES route_history_events(workflow_id, event_sequence)
    ON DELETE CASCADE,
  CHECK (event_sequence >= 1),
  CHECK (terminal IN (0, 1))
);

CREATE INDEX IF NOT EXISTS route_projection_snapshots_event_sequence_idx
  ON route_projection_snapshots (event_sequence);

CREATE TABLE IF NOT EXISTS symphony_users (
  user_id TEXT PRIMARY KEY NOT NULL,
  handle TEXT NOT NULL,
  display_name TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(handle)) > 0),
  CHECK (length(trim(display_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_users_handle_idx
  ON symphony_users (handle);

CREATE TABLE IF NOT EXISTS symphony_organizations (
  organization_id TEXT PRIMARY KEY NOT NULL,
  organization_slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(organization_slug)) > 0),
  CHECK (length(trim(display_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_organizations_slug_idx
  ON symphony_organizations (organization_slug);

CREATE TABLE IF NOT EXISTS symphony_organization_memberships (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES symphony_users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS symphony_organization_memberships_organization_id_idx
  ON symphony_organization_memberships (organization_id);

CREATE INDEX IF NOT EXISTS symphony_organization_memberships_user_id_idx
  ON symphony_organization_memberships (user_id);

CREATE TABLE IF NOT EXISTS symphony_external_auth_bindings (
  binding_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'linear', 'vercel')),
  provider_account_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(binding_id)) > 0),
  CHECK (length(trim(provider_account_id)) > 0),
  FOREIGN KEY (user_id) REFERENCES symphony_users(user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_external_auth_bindings_user_provider_idx
  ON symphony_external_auth_bindings (user_id, provider);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_external_auth_bindings_provider_account_idx
  ON symphony_external_auth_bindings (provider, provider_account_id);

CREATE INDEX IF NOT EXISTS symphony_external_auth_bindings_provider_idx
  ON symphony_external_auth_bindings (provider);

CREATE TABLE IF NOT EXISTS symphony_github_installation_identities (
  github_installation_identity_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github')),
  github_installation_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(github_installation_identity_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(github_installation_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_installation_identities_organization_installation_idx
  ON symphony_github_installation_identities (organization_id, github_installation_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_installation_identities_organization_identity_idx
  ON symphony_github_installation_identities (organization_id, github_installation_identity_id);

CREATE INDEX IF NOT EXISTS symphony_github_installation_identities_organization_id_idx
  ON symphony_github_installation_identities (organization_id);

CREATE TABLE IF NOT EXISTS symphony_github_repository_identities (
  github_repository_identity_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  github_installation_identity_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github')),
  repository_key TEXT NOT NULL,
  github_repository_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(github_repository_identity_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(github_installation_identity_id)) > 0),
  CHECK (length(trim(repository_key)) > 0),
  CHECK (length(trim(github_repository_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, github_installation_identity_id) REFERENCES symphony_github_installation_identities(organization_id, github_installation_identity_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_repository_identities_repository_key_idx
  ON symphony_github_repository_identities (repository_key);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_repository_identities_organization_repository_idx
  ON symphony_github_repository_identities (organization_id, github_repository_id);

CREATE INDEX IF NOT EXISTS symphony_github_repository_identities_organization_id_idx
  ON symphony_github_repository_identities (organization_id);

CREATE INDEX IF NOT EXISTS symphony_github_repository_identities_github_installation_identity_id_idx
  ON symphony_github_repository_identities (github_installation_identity_id);

CREATE TABLE IF NOT EXISTS symphony_linear_workspace_identities (
  linear_workspace_identity_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('linear')),
  linear_workspace_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(linear_workspace_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_workspace_identities_organization_workspace_idx
  ON symphony_linear_workspace_identities (organization_id, linear_workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_workspace_identities_organization_identity_idx
  ON symphony_linear_workspace_identities (organization_id, linear_workspace_identity_id);

CREATE INDEX IF NOT EXISTS symphony_linear_workspace_identities_organization_id_idx
  ON symphony_linear_workspace_identities (organization_id);

CREATE TABLE IF NOT EXISTS symphony_linear_team_identities (
  linear_team_identity_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  linear_workspace_identity_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('linear')),
  linear_team_key TEXT NOT NULL,
  linear_team_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(linear_team_identity_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  CHECK (length(trim(linear_team_key)) > 0),
  CHECK (length(trim(linear_team_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, linear_workspace_identity_id) REFERENCES symphony_linear_workspace_identities(organization_id, linear_workspace_identity_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_team_identities_organization_workspace_team_key_idx
  ON symphony_linear_team_identities (
    organization_id,
    linear_workspace_identity_id,
    linear_team_key
  );

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_team_identities_organization_team_idx
  ON symphony_linear_team_identities (organization_id, linear_team_id);

CREATE INDEX IF NOT EXISTS symphony_linear_team_identities_organization_id_idx
  ON symphony_linear_team_identities (organization_id);

CREATE INDEX IF NOT EXISTS symphony_linear_team_identities_linear_workspace_identity_id_idx
  ON symphony_linear_team_identities (linear_workspace_identity_id);

CREATE TABLE IF NOT EXISTS symphony_linear_project_identities (
  linear_project_identity_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  linear_workspace_identity_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('linear')),
  linear_project_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(linear_project_identity_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  CHECK (length(trim(linear_project_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, linear_workspace_identity_id) REFERENCES symphony_linear_workspace_identities(organization_id, linear_workspace_identity_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_project_identities_organization_project_idx
  ON symphony_linear_project_identities (organization_id, linear_project_id);

CREATE INDEX IF NOT EXISTS symphony_linear_project_identities_organization_id_idx
  ON symphony_linear_project_identities (organization_id);

CREATE INDEX IF NOT EXISTS symphony_linear_project_identities_linear_workspace_identity_id_idx
  ON symphony_linear_project_identities (linear_workspace_identity_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_repository_identities_organization_identity_idx
  ON symphony_github_repository_identities (organization_id, github_repository_identity_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_repository_identities_organization_installation_identity_idx
  ON symphony_github_repository_identities (
    organization_id,
    github_installation_identity_id,
    github_repository_identity_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_team_identities_organization_workspace_identity_idx
  ON symphony_linear_team_identities (
    organization_id,
    linear_workspace_identity_id,
    linear_team_identity_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_project_identities_organization_workspace_identity_idx
  ON symphony_linear_project_identities (
    organization_id,
    linear_workspace_identity_id,
    linear_project_identity_id
  );

CREATE TABLE IF NOT EXISTS symphony_repository_workspace_bindings (
  repository_workspace_binding_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  github_installation_identity_id TEXT NOT NULL,
  github_repository_identity_id TEXT NOT NULL,
  linear_workspace_identity_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'bootstrap', 'sync')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(repository_workspace_binding_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(github_installation_identity_id)) > 0),
  CHECK (length(trim(github_repository_identity_id)) > 0),
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, github_installation_identity_id)
    REFERENCES symphony_github_installation_identities(organization_id, github_installation_identity_id)
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, github_installation_identity_id, github_repository_identity_id)
    REFERENCES symphony_github_repository_identities(
      organization_id,
      github_installation_identity_id,
      github_repository_identity_id
    )
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, linear_workspace_identity_id)
    REFERENCES symphony_linear_workspace_identities(organization_id, linear_workspace_identity_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_organization_repository_workspace_idx
  ON symphony_repository_workspace_bindings (
    organization_id,
    github_repository_identity_id,
    linear_workspace_identity_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_organization_identity_idx
  ON symphony_repository_workspace_bindings (
    organization_id,
    repository_workspace_binding_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_organization_workspace_identity_idx
  ON symphony_repository_workspace_bindings (
    organization_id,
    repository_workspace_binding_id,
    linear_workspace_identity_id
  );

CREATE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_organization_id_idx
  ON symphony_repository_workspace_bindings (organization_id);

CREATE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_github_repository_identity_id_idx
  ON symphony_repository_workspace_bindings (github_repository_identity_id);

CREATE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_linear_workspace_identity_id_idx
  ON symphony_repository_workspace_bindings (linear_workspace_identity_id);

CREATE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_status_idx
  ON symphony_repository_workspace_bindings (status);

CREATE TABLE IF NOT EXISTS symphony_repository_team_bindings (
  repository_team_binding_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  repository_workspace_binding_id TEXT NOT NULL,
  linear_workspace_identity_id TEXT NOT NULL,
  linear_team_identity_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'bootstrap', 'sync')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(repository_team_binding_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(repository_workspace_binding_id)) > 0),
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  CHECK (length(trim(linear_team_identity_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, repository_workspace_binding_id, linear_workspace_identity_id)
    REFERENCES symphony_repository_workspace_bindings(
      organization_id,
      repository_workspace_binding_id,
      linear_workspace_identity_id
    )
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, linear_workspace_identity_id, linear_team_identity_id)
    REFERENCES symphony_linear_team_identities(
      organization_id,
      linear_workspace_identity_id,
      linear_team_identity_id
    )
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_team_bindings_organization_team_idx
  ON symphony_repository_team_bindings (organization_id, linear_team_identity_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_team_bindings_organization_identity_idx
  ON symphony_repository_team_bindings (organization_id, repository_team_binding_id);

CREATE INDEX IF NOT EXISTS symphony_repository_team_bindings_repository_workspace_binding_id_idx
  ON symphony_repository_team_bindings (repository_workspace_binding_id);

CREATE INDEX IF NOT EXISTS symphony_repository_team_bindings_linear_team_identity_id_idx
  ON symphony_repository_team_bindings (linear_team_identity_id);

CREATE INDEX IF NOT EXISTS symphony_repository_team_bindings_status_idx
  ON symphony_repository_team_bindings (status);

CREATE TABLE IF NOT EXISTS symphony_repository_project_bindings (
  repository_project_binding_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  repository_workspace_binding_id TEXT NOT NULL,
  linear_workspace_identity_id TEXT NOT NULL,
  linear_project_identity_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'bootstrap', 'sync')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(repository_project_binding_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(repository_workspace_binding_id)) > 0),
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  CHECK (length(trim(linear_project_identity_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, repository_workspace_binding_id, linear_workspace_identity_id)
    REFERENCES symphony_repository_workspace_bindings(
      organization_id,
      repository_workspace_binding_id,
      linear_workspace_identity_id
    )
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, linear_workspace_identity_id, linear_project_identity_id)
    REFERENCES symphony_linear_project_identities(
      organization_id,
      linear_workspace_identity_id,
      linear_project_identity_id
    )
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_project_bindings_organization_project_idx
  ON symphony_repository_project_bindings (organization_id, linear_project_identity_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_project_bindings_organization_identity_idx
  ON symphony_repository_project_bindings (organization_id, repository_project_binding_id);

CREATE INDEX IF NOT EXISTS symphony_repository_project_bindings_repository_workspace_binding_id_idx
  ON symphony_repository_project_bindings (repository_workspace_binding_id);

CREATE INDEX IF NOT EXISTS symphony_repository_project_bindings_linear_project_identity_id_idx
  ON symphony_repository_project_bindings (linear_project_identity_id);

CREATE INDEX IF NOT EXISTS symphony_repository_project_bindings_status_idx
  ON symphony_repository_project_bindings (status);

CREATE TABLE IF NOT EXISTS route_workflow_execution_contracts (
  workflow_id TEXT PRIMARY KEY NOT NULL,
  contract_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  objective TEXT NOT NULL,
  done_definition TEXT NOT NULL,
  required_capability_ids_json TEXT NOT NULL,
  preferred_capability_ids_json TEXT NOT NULL,
  forbidden_capability_ids_json TEXT NOT NULL,
  required_evidence_ids_json TEXT NOT NULL,
  allowed_model_profile_ids_json TEXT NOT NULL,
  clarification_mode TEXT NOT NULL CHECK (clarification_mode IN ('required', 'best_effort')),
  review_strictness TEXT NOT NULL CHECK (review_strictness IN ('standard', 'strict', 'adversarial')),
  max_retry_count INTEGER NOT NULL CHECK (max_retry_count >= 0),
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(contract_id)) > 0),
  CHECK (length(trim(summary)) > 0),
  CHECK (length(trim(objective)) > 0),
  CHECK (length(trim(done_definition)) > 0),
  FOREIGN KEY (workflow_id) REFERENCES route_workflows(workflow_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS route_workflow_execution_contracts_contract_id_idx
  ON route_workflow_execution_contracts (contract_id);

CREATE INDEX IF NOT EXISTS route_workflow_execution_contracts_updated_at_idx
  ON route_workflow_execution_contracts (updated_at);

CREATE TABLE IF NOT EXISTS route_workflow_capability_planner_decisions (
  decision_id TEXT PRIMARY KEY NOT NULL,
  workflow_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  contract_updated_at TEXT NOT NULL,
  history_event_sequence INTEGER NOT NULL CHECK (history_event_sequence >= 0),
  lifecycle_projection_sequence INTEGER NOT NULL CHECK (lifecycle_projection_sequence >= 0),
  lifecycle_current_node TEXT,
  plan_kind TEXT NOT NULL CHECK (
    plan_kind IN (
      'execute',
      'awaiting_input',
      'blocked',
      'ready_for_completion'
    )
  ),
  plan_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  CHECK (length(trim(decision_id)) > 0),
  CHECK (length(trim(contract_id)) > 0),
  CHECK (length(trim(contract_updated_at)) > 0),
  FOREIGN KEY (workflow_id) REFERENCES route_workflows(workflow_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS route_workflow_capability_planner_decisions_workflow_basis_idx
  ON route_workflow_capability_planner_decisions (
    workflow_id,
    history_event_sequence,
    contract_updated_at
  );

CREATE INDEX IF NOT EXISTS route_workflow_capability_planner_decisions_workflow_recorded_at_idx
  ON route_workflow_capability_planner_decisions (workflow_id, recorded_at);

CREATE TABLE IF NOT EXISTS route_workflow_capability_planner_commands (
  command_id TEXT PRIMARY KEY NOT NULL,
  workflow_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  history_event_sequence INTEGER NOT NULL CHECK (history_event_sequence >= 0),
  dedupe_key TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('capability.execute')),
  command_json TEXT NOT NULL,
  emitted_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  CHECK (length(trim(command_id)) > 0),
  CHECK (length(trim(contract_id)) > 0),
  FOREIGN KEY (workflow_id) REFERENCES route_workflows(workflow_id) ON DELETE CASCADE,
  FOREIGN KEY (decision_id) REFERENCES route_workflow_capability_planner_decisions(decision_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS route_workflow_capability_planner_commands_decision_id_idx
  ON route_workflow_capability_planner_commands (decision_id);

CREATE UNIQUE INDEX IF NOT EXISTS route_workflow_capability_planner_commands_workflow_dedupe_key_idx
  ON route_workflow_capability_planner_commands (workflow_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS route_workflow_capability_planner_commands_workflow_emitted_at_idx
  ON route_workflow_capability_planner_commands (workflow_id, emitted_at);

ALTER TABLE route_workflow_capability_planner_decisions
  ADD COLUMN policy_id TEXT NOT NULL DEFAULT 'default' CHECK (length(trim(policy_id)) > 0);

DROP INDEX IF EXISTS route_workflow_capability_planner_decisions_workflow_basis_idx;

CREATE UNIQUE INDEX IF NOT EXISTS route_workflow_capability_planner_decisions_workflow_basis_idx
  ON route_workflow_capability_planner_decisions (
    workflow_id,
    history_event_sequence,
    contract_updated_at,
    policy_id
  );

ALTER TABLE route_workflow_capability_planner_decisions
  ADD COLUMN intelligent_flow_router_decision_json TEXT;
