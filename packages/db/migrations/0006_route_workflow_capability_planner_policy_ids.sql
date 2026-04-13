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
