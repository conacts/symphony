CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_repository_identities_organization_identity_idx
  ON symphony_github_repository_identities (organization_id, github_repository_identity_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_github_repository_identities_organization_installation_identity_idx
  ON symphony_github_repository_identities (
    organization_id,
    github_installation_identity_id,
    github_repository_identity_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_team_identities_organization_workspace_identity_idx
  ON symphony_linear_team_identities (
    organization_id,
    linear_workspace_identity_id,
    linear_team_identity_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS symphony_linear_project_identities_organization_workspace_identity_idx
  ON symphony_linear_project_identities (
    organization_id,
    linear_workspace_identity_id,
    linear_project_identity_id
  );

CREATE TABLE IF NOT EXISTS symphony_repository_workspace_bindings (
  repository_workspace_binding_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  github_installation_identity_id TEXT NOT NULL,
  github_repository_identity_id TEXT NOT NULL,
  linear_workspace_identity_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'bootstrap', 'sync')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(repository_workspace_binding_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(github_installation_identity_id)) > 0),
  CHECK (length(trim(github_repository_identity_id)) > 0),
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, github_installation_identity_id)
    REFERENCES symphony_github_installation_identities(organization_id, github_installation_identity_id)
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, github_installation_identity_id, github_repository_identity_id)
    REFERENCES symphony_github_repository_identities(
      organization_id,
      github_installation_identity_id,
      github_repository_identity_id
    )
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, linear_workspace_identity_id)
    REFERENCES symphony_linear_workspace_identities(organization_id, linear_workspace_identity_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_organization_repository_workspace_idx
  ON symphony_repository_workspace_bindings (
    organization_id,
    github_repository_identity_id,
    linear_workspace_identity_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_organization_identity_idx
  ON symphony_repository_workspace_bindings (
    organization_id,
    repository_workspace_binding_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_organization_workspace_identity_idx
  ON symphony_repository_workspace_bindings (
    organization_id,
    repository_workspace_binding_id,
    linear_workspace_identity_id
  );

CREATE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_organization_id_idx
  ON symphony_repository_workspace_bindings (organization_id);

CREATE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_github_repository_identity_id_idx
  ON symphony_repository_workspace_bindings (github_repository_identity_id);

CREATE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_linear_workspace_identity_id_idx
  ON symphony_repository_workspace_bindings (linear_workspace_identity_id);

CREATE INDEX IF NOT EXISTS symphony_repository_workspace_bindings_status_idx
  ON symphony_repository_workspace_bindings (status);

CREATE TABLE IF NOT EXISTS symphony_repository_team_bindings (
  repository_team_binding_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  repository_workspace_binding_id TEXT NOT NULL,
  linear_workspace_identity_id TEXT NOT NULL,
  linear_team_identity_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'bootstrap', 'sync')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(repository_team_binding_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(repository_workspace_binding_id)) > 0),
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  CHECK (length(trim(linear_team_identity_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, repository_workspace_binding_id, linear_workspace_identity_id)
    REFERENCES symphony_repository_workspace_bindings(
      organization_id,
      repository_workspace_binding_id,
      linear_workspace_identity_id
    )
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, linear_workspace_identity_id, linear_team_identity_id)
    REFERENCES symphony_linear_team_identities(
      organization_id,
      linear_workspace_identity_id,
      linear_team_identity_id
    )
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_team_bindings_organization_team_idx
  ON symphony_repository_team_bindings (organization_id, linear_team_identity_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_team_bindings_organization_identity_idx
  ON symphony_repository_team_bindings (organization_id, repository_team_binding_id);

CREATE INDEX IF NOT EXISTS symphony_repository_team_bindings_repository_workspace_binding_id_idx
  ON symphony_repository_team_bindings (repository_workspace_binding_id);

CREATE INDEX IF NOT EXISTS symphony_repository_team_bindings_linear_team_identity_id_idx
  ON symphony_repository_team_bindings (linear_team_identity_id);

CREATE INDEX IF NOT EXISTS symphony_repository_team_bindings_status_idx
  ON symphony_repository_team_bindings (status);

CREATE TABLE IF NOT EXISTS symphony_repository_project_bindings (
  repository_project_binding_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  repository_workspace_binding_id TEXT NOT NULL,
  linear_workspace_identity_id TEXT NOT NULL,
  linear_project_identity_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'bootstrap', 'sync')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(repository_project_binding_id)) > 0),
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(repository_workspace_binding_id)) > 0),
  CHECK (length(trim(linear_workspace_identity_id)) > 0),
  CHECK (length(trim(linear_project_identity_id)) > 0),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, repository_workspace_binding_id, linear_workspace_identity_id)
    REFERENCES symphony_repository_workspace_bindings(
      organization_id,
      repository_workspace_binding_id,
      linear_workspace_identity_id
    )
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, linear_workspace_identity_id, linear_project_identity_id)
    REFERENCES symphony_linear_project_identities(
      organization_id,
      linear_workspace_identity_id,
      linear_project_identity_id
    )
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_project_bindings_organization_project_idx
  ON symphony_repository_project_bindings (organization_id, linear_project_identity_id);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_repository_project_bindings_organization_identity_idx
  ON symphony_repository_project_bindings (organization_id, repository_project_binding_id);

CREATE INDEX IF NOT EXISTS symphony_repository_project_bindings_repository_workspace_binding_id_idx
  ON symphony_repository_project_bindings (repository_workspace_binding_id);

CREATE INDEX IF NOT EXISTS symphony_repository_project_bindings_linear_project_identity_id_idx
  ON symphony_repository_project_bindings (linear_project_identity_id);

CREATE INDEX IF NOT EXISTS symphony_repository_project_bindings_status_idx
  ON symphony_repository_project_bindings (status);
