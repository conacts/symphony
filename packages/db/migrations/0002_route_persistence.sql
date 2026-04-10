CREATE TABLE IF NOT EXISTS route_workflows (
  workflow_id TEXT PRIMARY KEY NOT NULL,
  repository_key TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  router_name TEXT NOT NULL,
  router_version TEXT NOT NULL,
  archived_at TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (issue_identifier, repository_key)
    REFERENCES symphony_issues(issue_identifier, repository_key)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS route_workflows_repository_key_idx
ON route_workflows (repository_key);

CREATE INDEX IF NOT EXISTS route_workflows_issue_identifier_idx
ON route_workflows (issue_identifier);

CREATE UNIQUE INDEX IF NOT EXISTS route_workflows_live_issue_idx
ON route_workflows (issue_identifier)
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
  CHECK (signal_source IS NULL OR signal_source IN ('tracker', 'runtime', 'review', 'ci', 'operator', 'router'))
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
