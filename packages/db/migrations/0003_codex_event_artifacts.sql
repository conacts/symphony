ALTER TABLE codex_event_log
ADD COLUMN projection_loss_overflow_id TEXT;

ALTER TABLE codex_event_log
ADD COLUMN raw_payload_overflow_id TEXT;
