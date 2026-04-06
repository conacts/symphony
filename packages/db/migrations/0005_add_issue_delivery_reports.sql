CREATE TABLE symphony_issue_delivery_reports (
  report_id TEXT PRIMARY KEY NOT NULL,
  issue_id TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  run_id TEXT NOT NULL,
  turn_id TEXT,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  pr_url TEXT,
  pr_number TEXT,
  branch_name TEXT,
  blocking_reason TEXT,
  tests_summary TEXT,
  source TEXT NOT NULL,
  payload_json TEXT,
  reported_at TEXT NOT NULL,
  inserted_at TEXT NOT NULL
);

CREATE INDEX symphony_issue_delivery_reports_issue_identifier_idx
  ON symphony_issue_delivery_reports(issue_identifier, reported_at);

CREATE INDEX symphony_issue_delivery_reports_run_id_idx
  ON symphony_issue_delivery_reports(run_id, reported_at);

CREATE INDEX symphony_issue_delivery_reports_status_idx
  ON symphony_issue_delivery_reports(status, reported_at);
