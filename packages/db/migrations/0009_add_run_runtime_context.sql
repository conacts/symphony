CREATE TABLE IF NOT EXISTS symphony_run_runtime_context (
  run_id TEXT PRIMARY KEY NOT NULL,
  harness_kind TEXT,
  thread_id TEXT,
  session_id TEXT,
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
  ON symphony_run_runtime_context(harness_kind);

CREATE INDEX IF NOT EXISTS symphony_run_runtime_context_thread_id_idx
  ON symphony_run_runtime_context(thread_id);
