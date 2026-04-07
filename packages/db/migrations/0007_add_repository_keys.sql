ALTER TABLE symphony_issues
  ADD COLUMN repository_key TEXT NOT NULL DEFAULT 'default';

DROP INDEX IF EXISTS symphony_issues_issue_identifier_idx;

CREATE UNIQUE INDEX symphony_issues_repository_issue_identifier_idx
  ON symphony_issues(repository_key, issue_identifier);

CREATE INDEX symphony_issues_repository_key_idx
  ON symphony_issues(repository_key);

ALTER TABLE symphony_runs
  ADD COLUMN repository_key TEXT NOT NULL DEFAULT 'default';

DROP INDEX IF EXISTS symphony_runs_issue_identifier_idx;

CREATE INDEX symphony_runs_repository_key_idx
  ON symphony_runs(repository_key);

CREATE INDEX symphony_runs_repository_issue_identifier_idx
  ON symphony_runs(repository_key, issue_identifier);

ALTER TABLE symphony_issue_timeline_entries
  ADD COLUMN repository_key TEXT NOT NULL DEFAULT 'default';

DROP INDEX IF EXISTS symphony_issue_timeline_issue_identifier_idx;

CREATE INDEX symphony_issue_timeline_repository_issue_identifier_idx
  ON symphony_issue_timeline_entries(repository_key, issue_identifier);

CREATE INDEX symphony_issue_timeline_repository_key_idx
  ON symphony_issue_timeline_entries(repository_key);

ALTER TABLE symphony_issue_delivery_reports
  ADD COLUMN repository_key TEXT NOT NULL DEFAULT 'default';

DROP INDEX IF EXISTS symphony_issue_delivery_reports_issue_identifier_idx;

CREATE INDEX symphony_issue_delivery_reports_repository_issue_identifier_idx
  ON symphony_issue_delivery_reports(repository_key, issue_identifier, reported_at);

CREATE INDEX symphony_issue_delivery_reports_repository_key_idx
  ON symphony_issue_delivery_reports(repository_key, reported_at);

ALTER TABLE symphony_runtime_logs
  ADD COLUMN repository_key TEXT;

DROP INDEX IF EXISTS symphony_runtime_logs_issue_identifier_idx;

CREATE INDEX symphony_runtime_logs_repository_key_idx
  ON symphony_runtime_logs(repository_key);

CREATE INDEX symphony_runtime_logs_repository_issue_identifier_idx
  ON symphony_runtime_logs(repository_key, issue_identifier);
