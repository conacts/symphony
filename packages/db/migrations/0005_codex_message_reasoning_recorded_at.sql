ALTER TABLE codex_agent_messages
  ADD COLUMN recorded_at TEXT;

ALTER TABLE codex_reasoning
  ADD COLUMN recorded_at TEXT;

UPDATE codex_agent_messages
SET recorded_at = inserted_at
WHERE recorded_at IS NULL;

UPDATE codex_reasoning
SET recorded_at = inserted_at
WHERE recorded_at IS NULL;

CREATE INDEX IF NOT EXISTS codex_agent_messages_recorded_at_idx
  ON codex_agent_messages (recorded_at);

CREATE INDEX IF NOT EXISTS codex_agent_messages_run_recorded_at_idx
  ON codex_agent_messages (run_id, recorded_at);

CREATE INDEX IF NOT EXISTS codex_reasoning_recorded_at_idx
  ON codex_reasoning (recorded_at);

CREATE INDEX IF NOT EXISTS codex_reasoning_run_recorded_at_idx
  ON codex_reasoning (run_id, recorded_at);
