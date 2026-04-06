ALTER TABLE symphony_agent_command_executions ADD COLUMN timeout_seconds INTEGER;

ALTER TABLE pi_edits ADD COLUMN line_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pi_edits ADD COLUMN first_changed_line INTEGER;
ALTER TABLE pi_edits ADD COLUMN diff_preview TEXT;
ALTER TABLE pi_edits ADD COLUMN diff_overflow_id TEXT;

ALTER TABLE pi_writes ADD COLUMN line_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pi_writes ADD COLUMN content_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pi_writes ADD COLUMN bytes_written INTEGER;
