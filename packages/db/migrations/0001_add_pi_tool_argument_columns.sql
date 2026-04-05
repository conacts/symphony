-- Add dedicated tables for known pi tool calls.
--
-- These tables store validated, typed data extracted from the raw
-- arguments_json blob on symphony_agent_tool_calls.  Each pi tool
-- that accepts file paths or other structured arguments gets its own
-- table with properly typed columns.
--
-- The analytics adapter validates raw arguments through Zod schemas
-- derived from the real pi tool definitions (TypeBox schemas in
-- pi-coding-agent).  Only rows that pass validation get inserted,
-- so these tables are always correctly typed.

CREATE TABLE pi_reads (
  run_id     TEXT    NOT NULL,
  turn_id    TEXT    NOT NULL,
  item_id    TEXT    NOT NULL,
  path       TEXT    NOT NULL,
  read_offset     INTEGER,
  read_limit      INTEGER,
  inserted_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX pi_reads_run_id_idx   ON pi_reads (run_id);
CREATE INDEX pi_reads_path_idx     ON pi_reads (path);

CREATE TABLE pi_edits (
  run_id     TEXT    NOT NULL,
  turn_id    TEXT    NOT NULL,
  item_id    TEXT    NOT NULL,
  path       TEXT    NOT NULL,
  edit_count INTEGER NOT NULL,
  inserted_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX pi_edits_run_id_idx   ON pi_edits (run_id);
CREATE INDEX pi_edits_path_idx     ON pi_edits (path);

CREATE TABLE pi_writes (
  run_id     TEXT    NOT NULL,
  turn_id    TEXT    NOT NULL,
  item_id    TEXT    NOT NULL,
  path       TEXT    NOT NULL,
  inserted_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX pi_writes_run_id_idx   ON pi_writes (run_id);
CREATE INDEX pi_writes_path_idx     ON pi_writes (path);

CREATE TABLE pi_greps (
  run_id      TEXT    NOT NULL,
  turn_id     TEXT    NOT NULL,
  item_id     TEXT    NOT NULL,
  pattern     TEXT    NOT NULL,
  search_path TEXT,
  ignore_case INTEGER,
  inserted_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX pi_greps_run_id_idx ON pi_greps (run_id);

CREATE TABLE pi_finds (
  run_id      TEXT    NOT NULL,
  turn_id     TEXT    NOT NULL,
  item_id     TEXT    NOT NULL,
  pattern     TEXT    NOT NULL,
  search_path TEXT,
  inserted_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX pi_finds_run_id_idx ON pi_finds (run_id);
