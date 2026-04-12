CREATE TABLE IF NOT EXISTS symphony_users (
  user_id TEXT PRIMARY KEY NOT NULL,
  handle TEXT NOT NULL,
  display_name TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(handle)) > 0),
  CHECK (length(trim(display_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_users_handle_idx
  ON symphony_users (handle);

CREATE TABLE IF NOT EXISTS symphony_organizations (
  organization_id TEXT PRIMARY KEY NOT NULL,
  organization_slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(organization_id)) > 0),
  CHECK (length(trim(organization_slug)) > 0),
  CHECK (length(trim(display_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_organizations_slug_idx
  ON symphony_organizations (organization_slug);

CREATE TABLE IF NOT EXISTS symphony_organization_memberships (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id) REFERENCES symphony_organizations(organization_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES symphony_users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS symphony_organization_memberships_organization_id_idx
  ON symphony_organization_memberships (organization_id);

CREATE INDEX IF NOT EXISTS symphony_organization_memberships_user_id_idx
  ON symphony_organization_memberships (user_id);

CREATE TABLE IF NOT EXISTS symphony_external_auth_bindings (
  binding_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'linear', 'vercel')),
  provider_account_id TEXT NOT NULL,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(binding_id)) > 0),
  CHECK (length(trim(provider_account_id)) > 0),
  FOREIGN KEY (user_id) REFERENCES symphony_users(user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_external_auth_bindings_user_provider_idx
  ON symphony_external_auth_bindings (user_id, provider);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_external_auth_bindings_provider_account_idx
  ON symphony_external_auth_bindings (provider, provider_account_id);

CREATE INDEX IF NOT EXISTS symphony_external_auth_bindings_provider_idx
  ON symphony_external_auth_bindings (provider);
