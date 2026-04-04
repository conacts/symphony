CREATE TABLE IF NOT EXISTS symphony_issues (
  issue_id TEXT PRIMARY KEY NOT NULL,
  issue_identifier TEXT NOT NULL,
  latest_run_started_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_issues_issue_identifier_idx
  ON symphony_issues (issue_identifier);

CREATE INDEX IF NOT EXISTS symphony_issues_latest_run_started_at_idx
  ON symphony_issues (latest_run_started_at);

CREATE TABLE IF NOT EXISTS symphony_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
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
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS symphony_runs_issue_id_idx
  ON symphony_runs (issue_id);

CREATE INDEX IF NOT EXISTS symphony_runs_issue_identifier_idx
  ON symphony_runs (issue_identifier);

CREATE INDEX IF NOT EXISTS symphony_runs_started_at_idx
  ON symphony_runs (started_at);

CREATE TABLE IF NOT EXISTS symphony_turns (
  turn_id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  turn_sequence INTEGER NOT NULL,
  codex_thread_id TEXT,
  codex_turn_id TEXT,
  codex_session_id TEXT,
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
  codex_thread_id TEXT,
  codex_turn_id TEXT,
  codex_session_id TEXT,
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

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_issue_identifier_idx
  ON symphony_issue_timeline_entries (issue_identifier);

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_recorded_at_idx
  ON symphony_issue_timeline_entries (recorded_at);

CREATE TABLE IF NOT EXISTS symphony_runtime_logs (
  entry_id TEXT PRIMARY KEY NOT NULL,
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

CREATE INDEX IF NOT EXISTS symphony_runtime_logs_recorded_at_idx
  ON symphony_runtime_logs (recorded_at);

CREATE INDEX IF NOT EXISTS symphony_runtime_logs_issue_identifier_idx
  ON symphony_runtime_logs (issue_identifier);

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
