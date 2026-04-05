CREATE TABLE IF NOT EXISTS codex_task_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS codex_task_snapshots_run_id_idx
  ON codex_task_snapshots (run_id);

CREATE INDEX IF NOT EXISTS codex_task_snapshots_turn_id_idx
  ON codex_task_snapshots (turn_id);

CREATE INDEX IF NOT EXISTS codex_task_snapshots_item_id_idx
  ON codex_task_snapshots (item_id);

CREATE INDEX IF NOT EXISTS codex_task_snapshots_recorded_at_idx
  ON codex_task_snapshots (recorded_at);

CREATE TABLE IF NOT EXISTS codex_task_snapshot_items (
  snapshot_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  state TEXT NOT NULL,
  section TEXT,
  inserted_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS codex_task_snapshot_items_pk
  ON codex_task_snapshot_items (snapshot_id, position);

CREATE INDEX IF NOT EXISTS codex_task_snapshot_items_snapshot_id_idx
  ON codex_task_snapshot_items (snapshot_id);

CREATE INDEX IF NOT EXISTS codex_task_snapshot_items_state_idx
  ON codex_task_snapshot_items (state);
