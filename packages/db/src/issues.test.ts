import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueStore } from "./issues.js";
import {
  symphonyGitHubInstallationIdentitiesTable,
  symphonyGitHubRepositoryIdentitiesTable,
  symphonyLinearWorkspaceIdentitiesTable,
  symphonyOrganizationsTable,
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

function seedHostedRepositoryWorkspaceBinding(input: {
  database: ReturnType<typeof initializeSymphonyDb>;
  organizationId: string;
  linearWorkspaceIdentityId: string;
  repositoryWorkspaceBindingId: string;
  githubRepositoryIdentityId: string;
  repositoryKey: string;
  recordedAt: string;
}) {
  input.database.db.insert(symphonyOrganizationsTable).values({
    organizationId: input.organizationId,
    organizationSlug: input.organizationId,
    displayName: input.organizationId,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.database.db.insert(symphonyGitHubInstallationIdentitiesTable).values({
    githubInstallationIdentityId: `${input.organizationId}_installation_identity`,
    organizationId: input.organizationId,
    provider: "github",
    githubInstallationId: `${input.organizationId}_installation`,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.database.db.insert(symphonyGitHubRepositoryIdentitiesTable).values({
    githubRepositoryIdentityId: input.githubRepositoryIdentityId,
    organizationId: input.organizationId,
    githubInstallationIdentityId: `${input.organizationId}_installation_identity`,
    provider: "github",
    repositoryKey: input.repositoryKey,
    githubRepositoryId: `${input.githubRepositoryIdentityId}_repo`,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.database.db.insert(symphonyLinearWorkspaceIdentitiesTable).values({
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    organizationId: input.organizationId,
    provider: "linear",
    linearWorkspaceId: `${input.linearWorkspaceIdentityId}_workspace`,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.database.db.insert(symphonyRepositoryWorkspaceBindingsTable).values({
    repositoryWorkspaceBindingId: input.repositoryWorkspaceBindingId,
    organizationId: input.organizationId,
    githubInstallationIdentityId: `${input.organizationId}_installation_identity`,
    githubRepositoryIdentityId: input.githubRepositoryIdentityId,
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    source: "bootstrap",
    status: "active",
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();
}

describe("issue store", () => {
  it("records canonical issue identity and only advances latest run timestamps forward", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-500",
        trackerIssueId: "tracker-500",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T04:00:00.000Z"
      });

      await issueStore.upsert({
        issueIdentifier: "SYM-500",
        trackerIssueId: "tracker-500",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: "2026-04-10T04:05:00.000Z",
        recordedAt: "2026-04-10T04:06:00.000Z"
      });

      await issueStore.upsert({
        issueIdentifier: "SYM-500",
        trackerIssueId: "tracker-500",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: "2026-04-10T04:04:00.000Z",
        recordedAt: "2026-04-10T04:07:00.000Z"
      });

      const row = database.client.prepare(`
        select
          issue_identifier as issueIdentifier,
          tracker_issue_id as trackerIssueId,
          repository_key as repositoryKey,
          latest_run_started_at as latestRunStartedAt,
          inserted_at as insertedAt,
          updated_at as updatedAt
        from symphony_issues
        where issue_identifier = ?
      `).get("SYM-500") as {
        issueIdentifier: string;
        trackerIssueId: string;
        repositoryKey: string;
        latestRunStartedAt: string | null;
        insertedAt: string;
        updatedAt: string;
      };

      expect(row).toEqual({
        issueIdentifier: "SYM-500",
        trackerIssueId: "tracker-500",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: "2026-04-10T04:05:00.000Z",
        insertedAt: "2026-04-10T04:00:00.000Z",
        updatedAt: "2026-04-10T04:07:00.000Z"
      });
    } finally {
      database.close();
    }
  });

  it("rejects rebinding an issue to a different repository", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-repository-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-501",
        trackerIssueId: "tracker-501",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T04:10:00.000Z"
      });

      await expect(
        issueStore.upsert({
          issueIdentifier: "SYM-501",
          trackerIssueId: "tracker-501",
          repositoryKey: "openai/other-repo",
          latestRunStartedAt: null,
          recordedAt: "2026-04-10T04:11:00.000Z"
        })
      ).rejects.toThrow(
        "Issue SYM-501 is already bound to repository openai/symphony, not openai/other-repo."
      );
    } finally {
      database.close();
    }
  });

  it("rejects rebinding an issue to a different tracker issue id", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-tracker-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-502",
        trackerIssueId: "tracker-502",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T04:20:00.000Z"
      });

      await expect(
        issueStore.upsert({
          issueIdentifier: "SYM-502",
          trackerIssueId: "tracker-502B",
          repositoryKey: "openai/symphony",
          latestRunStartedAt: null,
          recordedAt: "2026-04-10T04:21:00.000Z"
        })
      ).rejects.toThrow(
        "Issue SYM-502 is already bound to tracker issue tracker-502, not tracker-502B."
      );
    } finally {
      database.close();
    }
  });

  it("loads canonical issue identity by identifier", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-fetch-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-503",
        trackerIssueId: "tracker-503",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: "2026-04-10T04:30:00.000Z",
        recordedAt: "2026-04-10T04:31:00.000Z"
      });

      await expect(issueStore.fetchByIdentifier("SYM-503")).resolves.toEqual({
        issueIdentifier: "SYM-503",
        trackerIssueId: "tracker-503",
        repositoryKey: "openai/symphony",
        bindingScope: null,
        repositoryWorkspaceBindingId: null,
        latestRunStartedAt: "2026-04-10T04:30:00.000Z",
        insertedAt: "2026-04-10T04:31:00.000Z",
        updatedAt: "2026-04-10T04:31:00.000Z"
      });
      await expect(issueStore.fetchByIdentifier("SYM-404")).resolves.toBeNull();
    } finally {
      database.close();
    }
  });

  it("loads canonical issue identity by tracker issue id", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-fetch-tracker-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-503T",
        trackerIssueId: "tracker-503T",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: "2026-04-10T04:32:00.000Z",
        recordedAt: "2026-04-10T04:33:00.000Z"
      });

      await expect(
        issueStore.fetchByTrackerIssueId("tracker-503T")
      ).resolves.toEqual({
        trackerIssueId: "tracker-503T",
        issueIdentifier: "SYM-503T",
        repositoryKey: "openai/symphony",
        bindingScope: null,
        repositoryWorkspaceBindingId: null,
        latestRunStartedAt: "2026-04-10T04:32:00.000Z",
        insertedAt: "2026-04-10T04:33:00.000Z",
        updatedAt: "2026-04-10T04:33:00.000Z"
      });
      await expect(issueStore.fetchByTrackerIssueId("tracker-404")).resolves.toBeNull();
    } finally {
      database.close();
    }
  });

  it("updates the identifier for an existing tracker issue instead of forking the canonical row", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-rename-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-505",
        trackerIssueId: "tracker-505",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T04:50:00.000Z"
      });

      await issueStore.upsert({
        issueIdentifier: "SYM-505-RENAMED",
        trackerIssueId: "tracker-505",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: "2026-04-10T04:55:00.000Z",
        recordedAt: "2026-04-10T04:56:00.000Z"
      });

      await expect(issueStore.fetchByIdentifier("SYM-505")).resolves.toBeNull();
      await expect(
        issueStore.fetchByTrackerIssueId("tracker-505")
      ).resolves.toEqual({
        trackerIssueId: "tracker-505",
        issueIdentifier: "SYM-505-RENAMED",
        repositoryKey: "openai/symphony",
        bindingScope: null,
        repositoryWorkspaceBindingId: null,
        latestRunStartedAt: "2026-04-10T04:55:00.000Z",
        insertedAt: "2026-04-10T04:50:00.000Z",
        updatedAt: "2026-04-10T04:56:00.000Z"
      });
    } finally {
      database.close();
    }
  });

  it("records hosted workspace scope and requires scoped reads to match", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-scoped-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      seedHostedRepositoryWorkspaceBinding({
        database,
        organizationId: "org-1",
        linearWorkspaceIdentityId: "workspace-1",
        repositoryWorkspaceBindingId: "repository_workspace_binding_1",
        githubRepositoryIdentityId: "github_repository_identity_1",
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-10T04:39:00.000Z"
      });

      await issueStore.upsert({
        issueIdentifier: "SYM-504",
        trackerIssueId: "tracker-504",
        repositoryKey: "openai/symphony",
        bindingScope: {
          organizationId: "org-1",
          linearWorkspaceIdentityId: "workspace-1"
        },
        repositoryWorkspaceBindingId: "repository_workspace_binding_1",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T04:40:00.000Z"
      });

      await expect(
        issueStore.fetchByScopedIdentifier({
          issueIdentifier: "SYM-504",
          bindingScope: {
            organizationId: "org-1",
            linearWorkspaceIdentityId: "workspace-1"
          }
        })
      ).resolves.toEqual({
        issueIdentifier: "SYM-504",
        trackerIssueId: "tracker-504",
        repositoryKey: "openai/symphony",
        bindingScope: {
          organizationId: "org-1",
          linearWorkspaceIdentityId: "workspace-1"
        },
        repositoryWorkspaceBindingId: "repository_workspace_binding_1",
        latestRunStartedAt: null,
        insertedAt: "2026-04-10T04:40:00.000Z",
        updatedAt: "2026-04-10T04:40:00.000Z"
      });

      await expect(issueStore.fetchByIdentifier("SYM-504")).resolves.toBeNull();
    } finally {
      database.close();
    }
  });

  it("rejects rebinding a hosted issue to a different repository workspace binding", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-hosted-binding-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      seedHostedRepositoryWorkspaceBinding({
        database,
        organizationId: "org-1",
        linearWorkspaceIdentityId: "workspace-1",
        repositoryWorkspaceBindingId: "repository_workspace_binding_1",
        githubRepositoryIdentityId: "github_repository_identity_1",
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-10T04:44:00.000Z"
      });

      await issueStore.upsert({
        issueIdentifier: "SYM-506",
        trackerIssueId: "tracker-506",
        repositoryKey: "openai/symphony",
        bindingScope: {
          organizationId: "org-1",
          linearWorkspaceIdentityId: "workspace-1"
        },
        repositoryWorkspaceBindingId: "repository_workspace_binding_1",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T04:45:00.000Z"
      });

      await expect(
        issueStore.upsert({
          issueIdentifier: "SYM-506",
          trackerIssueId: "tracker-506",
          repositoryKey: "openai/symphony",
          bindingScope: {
            organizationId: "org-1",
            linearWorkspaceIdentityId: "workspace-1"
          },
          repositoryWorkspaceBindingId: "repository_workspace_binding_2",
          latestRunStartedAt: null,
          recordedAt: "2026-04-10T04:46:00.000Z"
        })
      ).rejects.toThrow(
        "Issue SYM-506 is already bound to hosted repository workspace repository_workspace_binding_1, not repository_workspace_binding_2."
      );
    } finally {
      database.close();
    }
  });
});
