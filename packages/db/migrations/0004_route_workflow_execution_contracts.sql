CREATE TABLE IF NOT EXISTS route_workflow_execution_contracts (
  workflow_id TEXT PRIMARY KEY NOT NULL,
  contract_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  objective TEXT NOT NULL,
  done_definition TEXT NOT NULL,
  merge_policy TEXT NOT NULL CHECK (merge_policy IN ('manual')),
  required_capability_ids_json TEXT NOT NULL,
  preferred_capability_ids_json TEXT NOT NULL,
  forbidden_capability_ids_json TEXT NOT NULL,
  required_evidence_ids_json TEXT NOT NULL,
  allowed_model_profile_ids_json TEXT NOT NULL,
  completion_mode TEXT NOT NULL CHECK (completion_mode IN ('manual')),
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
