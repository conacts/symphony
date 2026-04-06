CREATE TABLE pi_message_ends (
  run_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  response_id TEXT,
  api TEXT,
  provider TEXT,
  model TEXT,
  stop_reason TEXT,
  response_timestamp TEXT,
  input_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, turn_id, item_id)
);

CREATE INDEX pi_message_ends_run_id_idx ON pi_message_ends (run_id);
CREATE INDEX pi_message_ends_response_id_idx ON pi_message_ends (response_id);
CREATE INDEX pi_message_ends_model_idx ON pi_message_ends (model);
