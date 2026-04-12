CREATE TABLE IF NOT EXISTS symphony_github_installation_identities (
  github_installation_identity_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github')),
  github_installation_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(github_installation_identity_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(github_installation_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_installation_identities_organization_installation_idx
  ON symphony_github_installation_identities (organization_id, github_installation_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_installation_identities_organization_identity_idx
  ON symphony_github_installation_identities (organization_id, github_installation_identity_id);

CREATE INDEX IF NOT EXISTS symphony_github_installation_identities_organization_id_idx
  ON symphony_github_installation_identities (organization_id);

CREATE TABLE IF NOT EXISTS symphony_github_repository_identities (
  github_repository_identity_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  github_installation_identity_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github')),
  repository_key TEXT NOT NULL,
  github_repository_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(github_repository_identity_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(github_installation_identity_id)) > 0),
  CHECK (length(trim(repository_key)) > 0),
  CHECK (length(trim(github_repository_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, github_installation_identity_id) REFERENCES symphony_github_installation_identities(organization_id, github_installation_identity_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_repository_identities_repository_key_idx
  ON symphony_github_repository_identities (repository_key);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_repository_identities_organization_repository_idx
  ON symphony_github_repository_identities (organization_id, github_repository_id);

CREATE INDEX IF NOT EXISTS symphony_github_repository_identities_organization_id_idx
  ON symphony_github_repository_identities (organization_id);

CREATE INDEX IF NOT EXISTS symphony_github_repository_identities_github_installation_identity_id_idx
  ON symphony_github_repository_identities (github_installation_identity_id);

CREATE TABLE IF NOT EXISTS symphony_linear_workspace_identities (
  linear_workspace_identity_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('linear')),
  linear_workspace_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(linear_workspace_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_workspace_identities_organization_workspace_idx
  ON symphony_linear_workspace_identities (organization_id, linear_workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_workspace_identities_organization_identity_idx
  ON symphony_linear_workspace_identities (organization_id, linear_workspace_identity_id);

CREATE INDEX IF NOT EXISTS symphony_linear_workspace_identities_organization_id_idx
  ON symphony_linear_workspace_identities (organization_id);

CREATE TABLE IF NOT EXISTS symphony_linear_team_identities (
  linear_team_identity_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  linear_workspace_identity_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('linear')),
  linear_team_key TEXT NOT NULL,
  linear_team_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(linear_team_identity_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  CHECK (length(trim(linear_team_key)) > 0),
  CHECK (length(trim(linear_team_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, linear_workspace_identity_id) REFERENCES symphony_linear_workspace_identities(organization_id, linear_workspace_identity_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_team_identities_organization_workspace_team_key_idx
  ON symphony_linear_team_identities (
    organization_id,
    linear_workspace_identity_id,
    linear_team_key
  );

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_team_identities_organization_team_idx
  ON symphony_linear_team_identities (organization_id, linear_team_id);

CREATE INDEX IF NOT EXISTS symphony_linear_team_identities_organization_id_idx
  ON symphony_linear_team_identities (organization_id);

CREATE INDEX IF NOT EXISTS symphony_linear_team_identities_linear_workspace_identity_id_idx
  ON symphony_linear_team_identities (linear_workspace_identity_id);

CREATE TABLE IF NOT EXISTS symphony_linear_project_identities (
  linear_project_identity_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  linear_workspace_identity_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('linear')),
  linear_project_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(linear_project_identity_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  CHECK (length(trim(linear_project_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, linear_workspace_identity_id) REFERENCES symphony_linear_workspace_identities(organization_id, linear_workspace_identity_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_project_identities_organization_project_idx
  ON symphony_linear_project_identities (organization_id, linear_project_id);

CREATE INDEX IF NOT EXISTS symphony_linear_project_identities_organization_id_idx
  ON symphony_linear_project_identities (organization_id);

CREATE INDEX IF NOT EXISTS symphony_linear_project_identities_linear_workspace_identity_id_idx
  ON symphony_linear_project_identities (linear_workspace_identity_id);
