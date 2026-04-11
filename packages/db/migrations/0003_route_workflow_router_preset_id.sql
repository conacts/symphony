PRAGMA foreign_keys=OFF;

CREATE TABLE route_workflows_next (
  workflow_id TEXT PRIMARY KEY NOT NULL,
  repository_key TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  router_preset_id TEXT NOT NULL,
  router_name TEXT NOT NULL,
  router_version TEXT NOT NULL,
  archived_at TEXT,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (issue_identifier, repository_key)
    REFERENCES symphony_issues(issue_identifier, repository_key)
    ON DELETE RESTRICT
);

INSERT INTO route_workflows_next (
  workflow_id,
  repository_key,
  issue_identifier,
  router_preset_id,
  router_name,
  router_version,
  archived_at,
  inserted_at,
  updated_at
)
SELECT
  workflow_id,
  repository_key,
  issue_identifier,
  'current-flow',
  router_name,
  router_version,
  archived_at,
  inserted_at,
  updated_at
FROM route_workflows;

DROP TABLE route_workflows;

ALTER TABLE route_workflows_next RENAME TO route_workflows;

CREATE INDEX route_workflows_repository_key_idx
ON route_workflows (repository_key);

CREATE INDEX route_workflows_issue_identifier_idx
ON route_workflows (issue_identifier);

CREATE UNIQUE INDEX route_workflows_live_issue_idx
ON route_workflows (issue_identifier)
WHERE archived_at IS NULL;

PRAGMA foreign_keys=ON;
