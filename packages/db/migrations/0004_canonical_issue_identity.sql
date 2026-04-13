DELETE FROM symphony_agent_task_snapshot_items;
DELETE FROM symphony_agent_task_snapshots;
DELETE FROM pi_reads;
DELETE FROM pi_edits;
DELETE FROM pi_writes;
DELETE FROM pi_greps;
DELETE FROM pi_finds;
DELETE FROM pi_message_ends;
DELETE FROM symphony_agent_messages;
DELETE FROM symphony_agent_reasoning;
DELETE FROM symphony_agent_file_changes;
DELETE FROM symphony_agent_command_executions;
DELETE FROM symphony_agent_tool_calls;
DELETE FROM symphony_agent_items;
DELETE FROM symphony_agent_event_log;
DELETE FROM symphony_agent_payload_overflow;
DELETE FROM symphony_run_runtime_context;
DELETE FROM symphony_events;
DELETE FROM symphony_turns;
DELETE FROM symphony_issue_delivery_reports;
DELETE FROM symphony_issue_timeline_entries;
DELETE FROM symphony_runtime_logs;
DELETE FROM symphony_runs;

DROP TABLE IF EXISTS symphony_issue_delivery_reports;
DROP TABLE IF EXISTS symphony_issue_timeline_entries;
DROP TABLE IF EXISTS symphony_runtime_logs;
DROP TABLE IF EXISTS symphony_runs;

DROP INDEX IF EXISTS symphony_issues_issue_identifier_idx;
DROP INDEX IF EXISTS symphony_issues_issue_repository_key_idx;

CREATE UNIQUE INDEX IF NOT EXISTS symphony_issues_unscoped_issue_identifier_idx
  ON symphony_issues (issue_identifier)
  WHERE organization_id IS NULL AND linear_workspace_identity_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS symphony_issues_scoped_issue_identifier_idx
  ON symphony_issues (
    organization_id,
    linear_workspace_identity_id,
    issue_identifier
  )
  WHERE organization_id IS NOT NULL AND linear_workspace_identity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS symphony_issues_issue_repository_key_idx
  ON symphony_issues (issue_identifier, repository_key);

CREATE TABLE IF NOT EXISTS symphony_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  tracker_issue_id TEXT NOT NULL,
  repository_key TEXT NOT NULL,
  organization_id TEXT,
  linear_workspace_identity_id TEXT,
  attempt INTEGER,
  run_mode TEXT NOT NULL CHECK (
    run_mode IN (
      'implementation',
      'rework',
      'approved_merge'
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
  FOREIGN KEY (tracker_issue_id)
    REFERENCES symphony_issues(tracker_issue_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
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

CREATE UNIQUE INDEX IF NOT EXISTS symphony_runs_issue_run_id_idx
  ON symphony_runs (tracker_issue_id, run_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_runs_one_active_run_per_issue_idx
  ON symphony_runs (tracker_issue_id)
  WHERE status IN ('dispatching', 'running');

CREATE INDEX IF NOT EXISTS symphony_runs_tracker_issue_id_idx
  ON symphony_runs (tracker_issue_id);

CREATE INDEX IF NOT EXISTS symphony_runs_repository_key_idx
  ON symphony_runs (repository_key);

CREATE INDEX IF NOT EXISTS symphony_runs_organization_id_idx
  ON symphony_runs (organization_id);

CREATE INDEX IF NOT EXISTS symphony_runs_linear_workspace_identity_id_idx
  ON symphony_runs (linear_workspace_identity_id);

CREATE INDEX IF NOT EXISTS symphony_runs_started_at_idx
  ON symphony_runs (started_at);

CREATE TRIGGER IF NOT EXISTS symphony_runs_insert_issue_binding_check
BEFORE INSERT ON symphony_runs
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'symphony_runs_issue_binding_mismatch')
  WHERE NOT EXISTS (
    SELECT 1
    FROM symphony_issues
    WHERE tracker_issue_id = NEW.tracker_issue_id
      AND repository_key = NEW.repository_key
  );
END;

CREATE TRIGGER IF NOT EXISTS symphony_runs_update_issue_binding_check
BEFORE UPDATE ON symphony_runs
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'symphony_runs_issue_binding_mismatch')
  WHERE NOT EXISTS (
    SELECT 1
    FROM symphony_issues
    WHERE tracker_issue_id = NEW.tracker_issue_id
      AND repository_key = NEW.repository_key
  );
END;

CREATE TABLE IF NOT EXISTS symphony_issue_timeline_entries (
  entry_id TEXT PRIMARY KEY NOT NULL,
  tracker_issue_id TEXT NOT NULL,
  run_id TEXT,
  turn_id TEXT,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  payload TEXT,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (tracker_issue_id)
    REFERENCES symphony_issues(tracker_issue_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (run_id) REFERENCES symphony_runs(run_id) ON DELETE SET NULL,
  FOREIGN KEY (turn_id) REFERENCES symphony_turns(turn_id) ON DELETE SET NULL,
  FOREIGN KEY (run_id, turn_id) REFERENCES symphony_turns(run_id, turn_id) ON DELETE SET NULL,
  CHECK (source IN ('orchestrator', 'agent', 'tracker', 'workspace', 'runtime')),
  CHECK (turn_id IS NULL OR run_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_tracker_issue_id_idx
  ON symphony_issue_timeline_entries (tracker_issue_id);

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_run_id_idx
  ON symphony_issue_timeline_entries (run_id);

CREATE INDEX IF NOT EXISTS symphony_issue_timeline_recorded_at_idx
  ON symphony_issue_timeline_entries (recorded_at);

CREATE TABLE IF NOT EXISTS symphony_issue_delivery_reports (
  report_id TEXT PRIMARY KEY NOT NULL,
  tracker_issue_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  turn_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed', 'blocked', 'partial')),
  summary TEXT NOT NULL,
  pr_url TEXT,
  pr_number TEXT,
  branch_name TEXT,
  blocking_reason TEXT,
  tests_summary TEXT,
  source TEXT NOT NULL CHECK (source IN ('pi', 'runtime')),
  payload_json TEXT,
  reported_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (tracker_issue_id)
    REFERENCES symphony_issues(tracker_issue_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (run_id)
    REFERENCES symphony_runs(run_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  FOREIGN KEY (run_id, turn_id) REFERENCES symphony_turns(run_id, turn_id) ON DELETE CASCADE,
  CHECK (status != 'completed' OR pr_url IS NOT NULL),
  CHECK (status != 'blocked' OR blocking_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS symphony_issue_delivery_reports_tracker_issue_id_idx
  ON symphony_issue_delivery_reports (tracker_issue_id, reported_at);

CREATE INDEX IF NOT EXISTS symphony_issue_delivery_reports_run_id_idx
  ON symphony_issue_delivery_reports (run_id, reported_at);

CREATE INDEX IF NOT EXISTS symphony_issue_delivery_reports_status_idx
  ON symphony_issue_delivery_reports (status, reported_at);

CREATE TRIGGER IF NOT EXISTS symphony_issue_delivery_reports_insert_issue_binding_check
BEFORE INSERT ON symphony_issue_delivery_reports
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'symphony_issue_delivery_reports_issue_binding_mismatch')
  WHERE NOT EXISTS (
    SELECT 1
    FROM symphony_runs
    WHERE run_id = NEW.run_id
      AND tracker_issue_id = NEW.tracker_issue_id
  );
END;

CREATE TRIGGER IF NOT EXISTS symphony_issue_delivery_reports_update_issue_binding_check
BEFORE UPDATE ON symphony_issue_delivery_reports
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'symphony_issue_delivery_reports_issue_binding_mismatch')
  WHERE NOT EXISTS (
    SELECT 1
    FROM symphony_runs
    WHERE run_id = NEW.run_id
      AND tracker_issue_id = NEW.tracker_issue_id
  );
END;

CREATE TABLE IF NOT EXISTS symphony_runtime_logs (
  entry_id TEXT PRIMARY KEY NOT NULL,
  repository_key TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  tracker_issue_id TEXT,
  run_id TEXT,
  payload TEXT,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  FOREIGN KEY (tracker_issue_id)
    REFERENCES symphony_issues(tracker_issue_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (run_id) REFERENCES symphony_runs(run_id) ON DELETE SET NULL,
  CHECK (level IN ('debug', 'info', 'warn', 'error'))
);

CREATE INDEX IF NOT EXISTS symphony_runtime_logs_repository_key_idx
  ON symphony_runtime_logs (repository_key);

CREATE INDEX IF NOT EXISTS symphony_runtime_logs_recorded_at_idx
  ON symphony_runtime_logs (recorded_at);

CREATE INDEX IF NOT EXISTS symphony_runtime_logs_tracker_issue_id_idx
  ON symphony_runtime_logs (tracker_issue_id);

CREATE TRIGGER IF NOT EXISTS symphony_runtime_logs_insert_issue_binding_check
BEFORE INSERT ON symphony_runtime_logs
FOR EACH ROW
WHEN NEW.tracker_issue_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'symphony_runtime_logs_issue_binding_mismatch')
  WHERE NOT EXISTS (
    SELECT 1
    FROM symphony_issues
    WHERE tracker_issue_id = NEW.tracker_issue_id
      AND repository_key = NEW.repository_key
  );
END;

CREATE TRIGGER IF NOT EXISTS symphony_runtime_logs_update_issue_binding_check
BEFORE UPDATE ON symphony_runtime_logs
FOR EACH ROW
WHEN NEW.tracker_issue_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'symphony_runtime_logs_issue_binding_mismatch')
  WHERE NOT EXISTS (
    SELECT 1
    FROM symphony_issues
    WHERE tracker_issue_id = NEW.tracker_issue_id
      AND repository_key = NEW.repository_key
  );
END;
