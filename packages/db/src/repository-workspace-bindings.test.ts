import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import {
  symphonyGitHubInstallationIdentitiesTable,
  symphonyGitHubRepositoryIdentitiesTable,
  symphonyLinearProjectIdentitiesTable,
  symphonyLinearTeamIdentitiesTable,
  symphonyLinearWorkspaceIdentitiesTable,
  symphonyOrganizationsTable,
  symphonyRepositoryProjectBindingsTable,
  symphonyRepositoryTeamBindingsTable,
  symphonyRepositoryWorkspaceBindingsTable
} from "./schema.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

async function createRepositoryWorkspaceBindingsDb() {
  const root = await mkdtemp(
    path.join(tmpdir(), "symphony-repository-workspace-bindings-")
  );
  tempDirectories.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });

  return {
    database,
    close() {
      database.close();
    }
  };
}

async function seedOrganizationExternalIdentities(input: {
  database: ReturnType<typeof initializeSymphonyDb>;
  organizationId: string;
  organizationSlug: string;
  now: string;
}) {
  input.database.db.insert(symphonyOrganizationsTable).values({
    organizationId: input.organizationId,
    organizationSlug: input.organizationSlug,
    displayName: input.organizationSlug,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyGitHubInstallationIdentitiesTable).values({
    githubInstallationIdentityId: `github_installation_identity_${input.organizationId}`,
    organizationId: input.organizationId,
    provider: "github",
    githubInstallationId: `github_installation_${input.organizationId}`,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyGitHubRepositoryIdentitiesTable).values({
    githubRepositoryIdentityId: `github_repository_identity_${input.organizationId}`,
    organizationId: input.organizationId,
    githubInstallationIdentityId: `github_installation_identity_${input.organizationId}`,
    provider: "github",
    repositoryKey: `openai/${input.organizationId}`,
    githubRepositoryId: `github_repository_${input.organizationId}`,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyLinearWorkspaceIdentitiesTable).values({
    linearWorkspaceIdentityId: `linear_workspace_identity_${input.organizationId}`,
    organizationId: input.organizationId,
    provider: "linear",
    linearWorkspaceId: `linear_workspace_${input.organizationId}`,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyLinearTeamIdentitiesTable).values({
    linearTeamIdentityId: `linear_team_identity_${input.organizationId}`,
    organizationId: input.organizationId,
    linearWorkspaceIdentityId: `linear_workspace_identity_${input.organizationId}`,
    provider: "linear",
    linearTeamKey: input.organizationId.toUpperCase(),
    linearTeamId: `linear_team_${input.organizationId}`,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyLinearProjectIdentitiesTable).values({
    linearProjectIdentityId: `linear_project_identity_${input.organizationId}`,
    organizationId: input.organizationId,
    linearWorkspaceIdentityId: `linear_workspace_identity_${input.organizationId}`,
    provider: "linear",
    linearProjectId: `linear_project_${input.organizationId}`,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();
}

describe("repository workspace binding schema", () => {
  it("stores canonical repository-to-workspace, team, and project bindings", async () => {
    const { database, close } = await createRepositoryWorkspaceBindingsDb();
    try {
      const now = "2026-04-12T14:00:00.000Z";

      await seedOrganizationExternalIdentities({
        database,
        organizationId: "org_001",
        organizationSlug: "openai",
        now
      });

      database.db.insert(symphonyRepositoryWorkspaceBindingsTable).values({
        repositoryWorkspaceBindingId: "repository_workspace_binding_001",
        organizationId: "org_001",
        githubInstallationIdentityId: "github_installation_identity_org_001",
        githubRepositoryIdentityId: "github_repository_identity_org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_001",
        source: "bootstrap",
        status: "active",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyRepositoryTeamBindingsTable).values({
        repositoryTeamBindingId: "repository_team_binding_001",
        organizationId: "org_001",
        repositoryWorkspaceBindingId: "repository_workspace_binding_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_001",
        linearTeamIdentityId: "linear_team_identity_org_001",
        source: "bootstrap",
        status: "active",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyRepositoryProjectBindingsTable).values({
        repositoryProjectBindingId: "repository_project_binding_001",
        organizationId: "org_001",
        repositoryWorkspaceBindingId: "repository_workspace_binding_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_001",
        linearProjectIdentityId: "linear_project_identity_org_001",
        source: "manual",
        status: "active",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(
        database.db.select().from(symphonyRepositoryWorkspaceBindingsTable).all()
      ).toHaveLength(1);
      expect(
        database.db.select().from(symphonyRepositoryTeamBindingsTable).all()
      ).toHaveLength(1);
      expect(
        database.db.select().from(symphonyRepositoryProjectBindingsTable).all()
      ).toHaveLength(1);
    } finally {
      close();
    }
  });

  it("rejects blank binding ids and unsupported source or status values", async () => {
    const { database, close } = await createRepositoryWorkspaceBindingsDb();
    try {
      const now = "2026-04-12T14:00:00.000Z";

      await seedOrganizationExternalIdentities({
        database,
        organizationId: "org_002",
        organizationSlug: "openai-2",
        now
      });

      expect(() =>
        database.client.prepare(`
          insert into symphony_repository_workspace_bindings (
            repository_workspace_binding_id,
            organization_id,
            github_installation_identity_id,
            github_repository_identity_id,
            linear_workspace_identity_id,
            source,
            status,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "",
          "org_002",
          "github_installation_identity_org_002",
          "github_repository_identity_org_002",
          "linear_workspace_identity_org_002",
          "bootstrap",
          "active",
          now,
          now
        )
      ).toThrow(/CHECK constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_repository_workspace_bindings (
            repository_workspace_binding_id,
            organization_id,
            github_installation_identity_id,
            github_repository_identity_id,
            linear_workspace_identity_id,
            source,
            status,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "repository_workspace_binding_002",
          "org_002",
          "github_installation_identity_org_002",
          "github_repository_identity_org_002",
          "linear_workspace_identity_org_002",
          "discovered",
          "active",
          now,
          now
        )
      ).toThrow(/CHECK constraint failed/);

      database.db.insert(symphonyRepositoryWorkspaceBindingsTable).values({
        repositoryWorkspaceBindingId: "repository_workspace_binding_002",
        organizationId: "org_002",
        githubInstallationIdentityId: "github_installation_identity_org_002",
        githubRepositoryIdentityId: "github_repository_identity_org_002",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_002",
        source: "manual",
        status: "active",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.client.prepare(`
          insert into symphony_repository_team_bindings (
            repository_team_binding_id,
            organization_id,
            repository_workspace_binding_id,
            linear_workspace_identity_id,
            linear_team_identity_id,
            source,
            status,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "repository_team_binding_002",
          "org_002",
          "repository_workspace_binding_002",
          "linear_workspace_identity_org_002",
          "linear_team_identity_org_002",
          "manual",
          "paused",
          now,
          now
        )
      ).toThrow(/CHECK constraint failed/);
    } finally {
      close();
    }
  });

  it("rejects orphaned, cross-tenant, and duplicate bindings", async () => {
    const { database, close } = await createRepositoryWorkspaceBindingsDb();
    try {
      const now = "2026-04-12T14:00:00.000Z";

      await seedOrganizationExternalIdentities({
        database,
        organizationId: "org_003",
        organizationSlug: "openai-3",
        now
      });
      await seedOrganizationExternalIdentities({
        database,
        organizationId: "org_004",
        organizationSlug: "openai-4",
        now
      });

      expect(() =>
        database.client.prepare(`
          insert into symphony_repository_workspace_bindings (
            repository_workspace_binding_id,
            organization_id,
            github_installation_identity_id,
            github_repository_identity_id,
            linear_workspace_identity_id,
            source,
            status,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "repository_workspace_binding_missing",
          "org_003",
          "github_installation_identity_missing",
          "github_repository_identity_org_003",
          "linear_workspace_identity_org_003",
          "bootstrap",
          "active",
          now,
          now
        )
      ).toThrow(/FOREIGN KEY constraint failed/);

      database.db.insert(symphonyRepositoryWorkspaceBindingsTable).values({
        repositoryWorkspaceBindingId: "repository_workspace_binding_003",
        organizationId: "org_003",
        githubInstallationIdentityId: "github_installation_identity_org_003",
        githubRepositoryIdentityId: "github_repository_identity_org_003",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_003",
        source: "bootstrap",
        status: "active",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.client.prepare(`
          insert into symphony_repository_workspace_bindings (
            repository_workspace_binding_id,
            organization_id,
            github_installation_identity_id,
            github_repository_identity_id,
            linear_workspace_identity_id,
            source,
            status,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "repository_workspace_binding_cross_org",
          "org_004",
          "github_installation_identity_org_003",
          "github_repository_identity_org_003",
          "linear_workspace_identity_org_004",
          "manual",
          "active",
          now,
          now
        )
      ).toThrow(/FOREIGN KEY constraint failed/);

      database.db.insert(symphonyRepositoryTeamBindingsTable).values({
        repositoryTeamBindingId: "repository_team_binding_003",
        organizationId: "org_003",
        repositoryWorkspaceBindingId: "repository_workspace_binding_003",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_003",
        linearTeamIdentityId: "linear_team_identity_org_003",
        source: "bootstrap",
        status: "active",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyRepositoryProjectBindingsTable).values({
        repositoryProjectBindingId: "repository_project_binding_003",
        organizationId: "org_003",
        repositoryWorkspaceBindingId: "repository_workspace_binding_003",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_003",
        linearProjectIdentityId: "linear_project_identity_org_003",
        source: "bootstrap",
        status: "active",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.client.prepare(`
          insert into symphony_repository_team_bindings (
            repository_team_binding_id,
            organization_id,
            repository_workspace_binding_id,
            linear_workspace_identity_id,
            linear_team_identity_id,
            source,
            status,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "repository_team_binding_cross_org",
          "org_004",
          "repository_workspace_binding_003",
          "linear_workspace_identity_org_004",
          "linear_team_identity_org_004",
          "manual",
          "active",
          now,
          now
        )
      ).toThrow(/FOREIGN KEY constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_repository_workspace_bindings (
            repository_workspace_binding_id,
            organization_id,
            github_installation_identity_id,
            github_repository_identity_id,
            linear_workspace_identity_id,
            source,
            status,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "repository_workspace_binding_duplicate",
          "org_003",
          "github_installation_identity_org_003",
          "github_repository_identity_org_003",
          "linear_workspace_identity_org_003",
          "manual",
          "active",
          now,
          now
        )
      ).toThrow(/UNIQUE constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_repository_team_bindings (
            repository_team_binding_id,
            organization_id,
            repository_workspace_binding_id,
            linear_workspace_identity_id,
            linear_team_identity_id,
            source,
            status,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "repository_team_binding_duplicate",
          "org_003",
          "repository_workspace_binding_003",
          "linear_workspace_identity_org_003",
          "linear_team_identity_org_003",
          "manual",
          "active",
          now,
          now
        )
      ).toThrow(/UNIQUE constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_repository_project_bindings (
            repository_project_binding_id,
            organization_id,
            repository_workspace_binding_id,
            linear_workspace_identity_id,
            linear_project_identity_id,
            source,
            status,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "repository_project_binding_duplicate",
          "org_003",
          "repository_workspace_binding_003",
          "linear_workspace_identity_org_003",
          "linear_project_identity_org_003",
          "sync",
          "active",
          now,
          now
        )
      ).toThrow(/UNIQUE constraint failed/);
    } finally {
      close();
    }
  });
});
