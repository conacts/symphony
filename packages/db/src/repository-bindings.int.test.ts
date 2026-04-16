import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyRepositoryBindingStore } from "./repository-bindings.js";
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

async function createRepositoryBindingsDb() {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-repository-bindings-"));
  tempDirectories.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });

  return {
    database,
    store: createSymphonyRepositoryBindingStore(database.db),
    close() {
      database.close();
    }
  };
}

async function seedRepositoryBindingsFixture(input: {
  database: ReturnType<typeof initializeSymphonyDb>;
  organizationId: string;
  linearWorkspaceIdentityId: string;
  repositoryWorkspaceBindingId: string;
  repositoryKey: string;
  linearTeamKey: string;
  linearProjectId: string;
  source: "manual" | "bootstrap" | "sync";
  status: "active" | "inactive";
  now: string;
}) {
  input.database.db.insert(symphonyOrganizationsTable).values({
    organizationId: input.organizationId,
    organizationSlug: input.organizationId,
    displayName: input.organizationId,
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
    repositoryKey: input.repositoryKey,
    githubRepositoryId: `github_repository_${input.organizationId}`,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyLinearWorkspaceIdentitiesTable).values({
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    organizationId: input.organizationId,
    provider: "linear",
    linearWorkspaceId: `linear_workspace_${input.organizationId}`,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyLinearTeamIdentitiesTable).values({
    linearTeamIdentityId: `linear_team_identity_${input.organizationId}`,
    organizationId: input.organizationId,
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    provider: "linear",
    linearTeamKey: input.linearTeamKey,
    linearTeamId: `linear_team_${input.organizationId}`,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyLinearProjectIdentitiesTable).values({
    linearProjectIdentityId: `linear_project_identity_${input.organizationId}`,
    organizationId: input.organizationId,
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    provider: "linear",
    linearProjectId: input.linearProjectId,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyRepositoryWorkspaceBindingsTable).values({
    repositoryWorkspaceBindingId: input.repositoryWorkspaceBindingId,
    organizationId: input.organizationId,
    githubInstallationIdentityId: `github_installation_identity_${input.organizationId}`,
    githubRepositoryIdentityId: `github_repository_identity_${input.organizationId}`,
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    source: input.source,
    status: input.status,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyRepositoryTeamBindingsTable).values({
    repositoryTeamBindingId: `repository_team_binding_${input.organizationId}`,
    organizationId: input.organizationId,
    repositoryWorkspaceBindingId: input.repositoryWorkspaceBindingId,
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    linearTeamIdentityId: `linear_team_identity_${input.organizationId}`,
    source: input.source,
    status: input.status,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();

  input.database.db.insert(symphonyRepositoryProjectBindingsTable).values({
    repositoryProjectBindingId: `repository_project_binding_${input.organizationId}`,
    organizationId: input.organizationId,
    repositoryWorkspaceBindingId: input.repositoryWorkspaceBindingId,
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    linearProjectIdentityId: `linear_project_identity_${input.organizationId}`,
    source: input.source,
    status: input.status,
    insertedAt: input.now,
    updatedAt: input.now
  }).run();
}

describe("repository binding store", () => {
  it("loads the active workspace binding catalog with repository and scope bridge data", async () => {
    const { database, store, close } = await createRepositoryBindingsDb();
    try {
      await seedRepositoryBindingsFixture({
        database,
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_001",
        repositoryWorkspaceBindingId: "repository_workspace_binding_org_001",
        repositoryKey: "openai/symphony",
        linearTeamKey: "SYM",
        linearProjectId: "project-001",
        source: "bootstrap",
        status: "active",
        now: "2026-04-12T16:00:00.000Z"
      });

      const catalog = await store.loadActiveWorkspaceBindingCatalog({
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_001"
      });

      expect(catalog).toEqual({
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_001",
        repositories: [
          {
            repositoryWorkspaceBindingId: "repository_workspace_binding_org_001",
            githubInstallationIdentityId: "github_installation_identity_org_001",
            githubRepositoryIdentityId: "github_repository_identity_org_001",
            repositoryKey: "openai/symphony",
            linearWorkspaceIdentityId: "linear_workspace_identity_org_001",
            source: "bootstrap",
            teamBindings: [
              {
                repositoryTeamBindingId: "repository_team_binding_org_001",
                linearTeamIdentityId: "linear_team_identity_org_001",
                linearTeamId: "linear_team_org_001",
                linearTeamKey: "SYM",
                source: "bootstrap"
              }
            ],
            projectBindings: [
              {
                repositoryProjectBindingId: "repository_project_binding_org_001",
                linearProjectIdentityId: "linear_project_identity_org_001",
                linearProjectId: "project-001",
                source: "bootstrap"
              }
            ]
          }
        ]
      });
    } finally {
      close();
    }
  });

  it("filters inactive bindings and fails fast on missing lookup identity", async () => {
    const { database, store, close } = await createRepositoryBindingsDb();
    try {
      await seedRepositoryBindingsFixture({
        database,
        organizationId: "org_002",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_002",
        repositoryWorkspaceBindingId: "repository_workspace_binding_org_002",
        repositoryKey: "openai/coldets",
        linearTeamKey: "COL",
        linearProjectId: "project-002",
        source: "manual",
        status: "inactive",
        now: "2026-04-12T16:00:00.000Z"
      });

      const catalog = await store.loadActiveWorkspaceBindingCatalog({
        organizationId: "org_002",
        linearWorkspaceIdentityId: "linear_workspace_identity_org_002"
      });

      expect(catalog.repositories).toEqual([]);

      await expect(
        store.loadActiveWorkspaceBindingCatalog({
          organizationId: " ",
          linearWorkspaceIdentityId: "linear_workspace_identity_org_002"
        })
      ).rejects.toThrow(/organizationId is required/i);
    } finally {
      close();
    }
  });
});
