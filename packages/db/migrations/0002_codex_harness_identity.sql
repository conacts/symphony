ALTER TABLE codex_runs ADD COLUMN harness_kind TEXT;
ALTER TABLE codex_runs ADD COLUMN model TEXT;
ALTER TABLE codex_runs ADD COLUMN provider_id TEXT;
ALTER TABLE codex_runs ADD COLUMN provider_name TEXT;

ALTER TABLE codex_turns ADD COLUMN harness_kind TEXT;
ALTER TABLE codex_turns ADD COLUMN model TEXT;
ALTER TABLE codex_turns ADD COLUMN provider_id TEXT;
ALTER TABLE codex_turns ADD COLUMN provider_name TEXT;
