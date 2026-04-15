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
