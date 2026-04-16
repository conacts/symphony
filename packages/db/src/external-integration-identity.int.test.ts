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
  symphonyOrganizationsTable
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

async function createExternalIntegrationIdentityDb() {
  const root = await mkdtemp(
    path.join(tmpdir(), "symphony-external-integration-identity-")
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

describe("external integration identity schema", () => {
  it("stores tenant-scoped github and linear integration identities", async () => {
    const { database, close } = await createExternalIntegrationIdentityDb();
    try {
      const now = "2026-04-12T12:30:00.000Z";

      database.db.insert(symphonyOrganizationsTable).values({
        organizationId: "org_001",
        organizationSlug: "openai",
        displayName: "OpenAI",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyGitHubInstallationIdentitiesTable).values({
        githubInstallationIdentityId: "github_installation_identity_001",
        organizationId: "org_001",
        provider: "github",
        githubInstallationId: "github_installation_001",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyGitHubRepositoryIdentitiesTable).values({
        githubRepositoryIdentityId: "github_repository_identity_001",
        organizationId: "org_001",
        githubInstallationIdentityId: "github_installation_identity_001",
        provider: "github",
        repositoryKey: "openai/symphony",
        githubRepositoryId: "github_repository_001",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyLinearWorkspaceIdentitiesTable).values({
        linearWorkspaceIdentityId: "linear_workspace_identity_001",
        organizationId: "org_001",
        provider: "linear",
        linearWorkspaceId: "linear_workspace_001",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyLinearTeamIdentitiesTable).values({
        linearTeamIdentityId: "linear_team_identity_001",
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_001",
        provider: "linear",
        linearTeamKey: "SYM",
        linearTeamId: "linear_team_001",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyLinearProjectIdentitiesTable).values({
        linearProjectIdentityId: "linear_project_identity_001",
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_001",
        provider: "linear",
        linearProjectId: "linear_project_001",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(
        database.db.select().from(symphonyGitHubInstallationIdentitiesTable).all()
      ).toHaveLength(1);
      expect(
        database.db.select().from(symphonyGitHubRepositoryIdentitiesTable).all()
      ).toHaveLength(1);
      expect(
        database.db.select().from(symphonyLinearWorkspaceIdentitiesTable).all()
      ).toHaveLength(1);
      expect(
        database.db.select().from(symphonyLinearTeamIdentitiesTable).all()
      ).toHaveLength(1);
      expect(
        database.db.select().from(symphonyLinearProjectIdentitiesTable).all()
      ).toHaveLength(1);
    } finally {
      close();
    }
  });

  it("rejects blank ids and unsupported provider enum values", async () => {
    const { database, close } = await createExternalIntegrationIdentityDb();
    try {
      const now = "2026-04-12T12:30:00.000Z";

      database.db.insert(symphonyOrganizationsTable).values({
        organizationId: "org_002",
        organizationSlug: "openai-2",
        displayName: "OpenAI 2",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.client.prepare(`
          insert into symphony_github_installation_identities (
            github_installation_identity_id,
            organization_id,
            provider,
            github_installation_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?)
        `).run("", "org_002", "github", "github_installation_002", now, now)
      ).toThrow(/CHECK constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_github_repository_identities (
            github_repository_identity_id,
            organization_id,
            github_installation_identity_id,
            provider,
            repository_key,
            github_repository_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "github_repository_identity_002",
          "org_002",
          "",
          "github",
          "",
          "github_repository_002",
          now,
          now
        )
      ).toThrow(/CHECK constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_linear_workspace_identities (
            linear_workspace_identity_id,
            organization_id,
            provider,
            linear_workspace_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?)
        `).run(
          "linear_workspace_identity_002",
          "org_002",
          "slack",
          "linear_workspace_002",
          now,
          now
        )
      ).toThrow(/CHECK constraint failed/);

      database.db.insert(symphonyLinearWorkspaceIdentitiesTable).values({
        linearWorkspaceIdentityId: "linear_workspace_identity_002",
        organizationId: "org_002",
        provider: "linear",
        linearWorkspaceId: "linear_workspace_002",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.client.prepare(`
          insert into symphony_linear_project_identities (
            linear_project_identity_id,
            organization_id,
            linear_workspace_identity_id,
            provider,
            linear_project_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?)
        `).run(
          "linear_project_identity_002",
          "org_002",
          "linear_workspace_identity_002",
          "linear",
          "",
          now,
          now
        )
      ).toThrow(/CHECK constraint failed/);
    } finally {
      close();
    }
  });

  it("rejects orphaned parent rows and duplicate external ids", async () => {
    const { database, close } = await createExternalIntegrationIdentityDb();
    try {
      const now = "2026-04-12T12:30:00.000Z";

      database.db.insert(symphonyOrganizationsTable).values({
        organizationId: "org_003",
        organizationSlug: "openai-3",
        displayName: "OpenAI 3",
        insertedAt: now,
        updatedAt: now
      }).run();
      database.db.insert(symphonyOrganizationsTable).values({
        organizationId: "org_004",
        organizationSlug: "openai-4",
        displayName: "OpenAI 4",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.client.prepare(`
          insert into symphony_github_repository_identities (
            github_repository_identity_id,
            organization_id,
            github_installation_identity_id,
            provider,
            repository_key,
            github_repository_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "github_repository_identity_missing",
          "org_003",
          "github_installation_identity_missing",
          "github",
          "openai/symphony",
          "github_repository_003",
          now,
          now
        )
      ).toThrow(/FOREIGN KEY constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_linear_team_identities (
            linear_team_identity_id,
            organization_id,
            linear_workspace_identity_id,
            provider,
            linear_team_key,
            linear_team_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "linear_team_identity_missing",
          "org_003",
          "linear_workspace_identity_missing",
          "linear",
          "SYM",
          "linear_team_003",
          now,
          now
        )
      ).toThrow(/FOREIGN KEY constraint failed/);

      database.db.insert(symphonyGitHubInstallationIdentitiesTable).values({
        githubInstallationIdentityId: "github_installation_identity_003",
        organizationId: "org_003",
        provider: "github",
        githubInstallationId: "github_installation_003",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyLinearWorkspaceIdentitiesTable).values({
        linearWorkspaceIdentityId: "linear_workspace_identity_003",
        organizationId: "org_003",
        provider: "linear",
        linearWorkspaceId: "linear_workspace_003",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.client.prepare(`
          insert into symphony_github_repository_identities (
            github_repository_identity_id,
            organization_id,
            github_installation_identity_id,
            provider,
            repository_key,
            github_repository_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "github_repository_identity_cross_org",
          "org_004",
          "github_installation_identity_003",
          "github",
          "openai/cross-org",
          "github_repository_cross_org",
          now,
          now
        )
      ).toThrow(/FOREIGN KEY constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_linear_team_identities (
            linear_team_identity_id,
            organization_id,
            linear_workspace_identity_id,
            provider,
            linear_team_key,
            linear_team_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "linear_team_identity_cross_org",
          "org_004",
          "linear_workspace_identity_003",
          "linear",
          "SYM",
          "linear_team_cross_org",
          now,
          now
        )
      ).toThrow(/FOREIGN KEY constraint failed/);

      database.db.insert(symphonyGitHubRepositoryIdentitiesTable).values({
        githubRepositoryIdentityId: "github_repository_identity_003",
        organizationId: "org_003",
        githubInstallationIdentityId: "github_installation_identity_003",
        provider: "github",
        repositoryKey: "openai/runtime",
        githubRepositoryId: "github_repository_003",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyLinearTeamIdentitiesTable).values({
        linearTeamIdentityId: "linear_team_identity_003",
        organizationId: "org_003",
        linearWorkspaceIdentityId: "linear_workspace_identity_003",
        provider: "linear",
        linearTeamKey: "COL",
        linearTeamId: "linear_team_003",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyLinearProjectIdentitiesTable).values({
        linearProjectIdentityId: "linear_project_identity_003",
        organizationId: "org_003",
        linearWorkspaceIdentityId: "linear_workspace_identity_003",
        provider: "linear",
        linearProjectId: "linear_project_003",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.db.insert(symphonyGitHubInstallationIdentitiesTable).values({
          githubInstallationIdentityId: "github_installation_identity_004",
          organizationId: "org_003",
          provider: "github",
          githubInstallationId: "github_installation_003",
          insertedAt: now,
          updatedAt: now
        }).run()
      ).toThrow(/UNIQUE constraint failed/);

      expect(() =>
        database.db.insert(symphonyGitHubRepositoryIdentitiesTable).values({
          githubRepositoryIdentityId: "github_repository_identity_004",
          organizationId: "org_003",
          githubInstallationIdentityId: "github_installation_identity_003",
          provider: "github",
          repositoryKey: "openai/runtime",
          githubRepositoryId: "github_repository_004",
          insertedAt: now,
          updatedAt: now
        }).run()
      ).toThrow(/UNIQUE constraint failed/);

      expect(() =>
        database.db.insert(symphonyLinearWorkspaceIdentitiesTable).values({
          linearWorkspaceIdentityId: "linear_workspace_identity_004",
          organizationId: "org_003",
          provider: "linear",
          linearWorkspaceId: "linear_workspace_003",
          insertedAt: now,
          updatedAt: now
        }).run()
      ).toThrow(/UNIQUE constraint failed/);

      expect(() =>
        database.db.insert(symphonyLinearTeamIdentitiesTable).values({
          linearTeamIdentityId: "linear_team_identity_004",
          organizationId: "org_003",
          linearWorkspaceIdentityId: "linear_workspace_identity_003",
          provider: "linear",
          linearTeamKey: "COL",
          linearTeamId: "linear_team_004",
          insertedAt: now,
          updatedAt: now
        }).run()
      ).toThrow(/UNIQUE constraint failed/);
    } finally {
      close();
    }
  });
});
