import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb,
  symphonyGitHubInstallationIdentitiesTable,
  symphonyGitHubRepositoryIdentitiesTable,
  symphonyLinearWorkspaceIdentitiesTable,
  symphonyOrganizationsTable,
  symphonyRepositoryWorkspaceBindingsTable
} from "@symphony/db";
import { buildSymphonyRuntimePolicy, buildSymphonyTrackerIssue } from "@symphony/test-support";
import {
  createRuntimeAutoMergeRouting,
  createRuntimeCurrentFlowRouting
} from "./runtime-workflow-presets.js";
import { createRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";

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

describe("runtime workflow session loader", () => {
  it("resumes persisted workflows from stored workflow identity", async () => {
    const harness = await createHarness();

    try {
      const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
        trackerIssueId: harness.issue.id,
        trackerIssueKey: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        routerPresetId: harness.routing.presetId,
        router: harness.routing.router,
        createdAt: "2026-04-10T16:00:00.000Z"
      });

      const loaded = await harness.sessionLoader.resumeByWorkflowId({
        workflowId: ensured.workflow.workflowId
      });

      expect(loaded).not.toBeNull();
      expect(loaded?.routing.presetId).toBe("current-flow");
      expect(loaded?.resumed.hydrationState.workflow.workflowId).toBe(
        ensured.workflow.workflowId
      );
    } finally {
      harness.close();
    }
  });

  it("resumes alternate preset workflows from stored workflow identity", async () => {
    const harness = await createHarness();

    try {
      const routing = await createRuntimeAutoMergeRouting({
        trackerConfig: harness.runtimePolicy.tracker,
        now: () => new Date("2026-04-10T16:02:00.000Z")
      });
      const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
        trackerIssueId: harness.issue.id,
        trackerIssueKey: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        routerPresetId: routing.presetId,
        router: routing.router,
        createdAt: "2026-04-10T16:02:00.000Z"
      });

      const loaded = await harness.sessionLoader.resumeByWorkflowId({
        workflowId: ensured.workflow.workflowId
      });

      expect(loaded).not.toBeNull();
      expect(loaded?.routing.presetId).toBe("auto-merge");
      expect(loaded?.routing.router.definition().name).toBe("symphony-auto-merge-flow");
    } finally {
      harness.close();
    }
  });

  it("fails fast when the stored workflow preset id is not registered", async () => {
    const harness = await createHarness();

    try {
      const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
        trackerIssueId: harness.issue.id,
        trackerIssueKey: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        routerPresetId: harness.routing.presetId,
        router: harness.routing.router,
        createdAt: "2026-04-10T16:05:00.000Z"
      });

      harness.database.client
        .prepare(
          "update route_workflows set router_preset_id = ? where workflow_id = ?"
        )
        .run("missing", ensured.workflow.workflowId);

      await expect(
        harness.sessionLoader.resumeByTrackerIssueKey({
          trackerIssueKey: harness.issue.identifier
        })
      ).rejects.toThrow(/Unknown workflow router preset/);
    } finally {
      harness.close();
    }
  });

  it("fails fast when the stored workflow router definition no longer matches the preset", async () => {
    const harness = await createHarness();

    try {
      const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
        trackerIssueId: harness.issue.id,
        trackerIssueKey: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        routerPresetId: harness.routing.presetId,
        router: harness.routing.router,
        createdAt: "2026-04-10T16:10:00.000Z"
      });

      harness.database.client
        .prepare(
          "update route_workflows set router_version = ? where workflow_id = ?"
        )
        .run("999", ensured.workflow.workflowId);

      await expect(
        harness.sessionLoader.resumeByTrackerIssueKey({
          trackerIssueKey: harness.issue.identifier
        })
      ).rejects.toThrow(/bound to router version/);
    } finally {
      harness.close();
    }
  });

  it("uses the configured workspace scope for issue-based workflow hydration", async () => {
    const harness = await createHarness({
      bindingScope: {
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_001"
      }
    });

    try {
      const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
        trackerIssueId: harness.issue.id,
        trackerIssueKey: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        bindingScope: {
          organizationId: "org_001",
          linearWorkspaceIdentityId: "linear_workspace_identity_001"
        },
        routerPresetId: harness.routing.presetId,
        router: harness.routing.router,
        createdAt: "2026-04-10T16:12:00.000Z"
      });

      const loaded = await harness.sessionLoader.resumeByTrackerIssueKey({
        trackerIssueKey: harness.issue.identifier
      });
      const unscopedLoader = await createRuntimeWorkflowSessionLoader({
        routeWorkflows: harness.routeWorkflows,
        trackerConfig: harness.runtimePolicy.tracker,
        now: () => new Date("2026-04-10T16:12:00.000Z")
      });
      const unscoped = await unscopedLoader.resumeByTrackerIssueKey({
        trackerIssueKey: harness.issue.identifier
      });

      expect(loaded?.resumed.hydrationState.workflow.workflowId).toBe(
        ensured.workflow.workflowId
      );
      expect(loaded?.resumed.hydrationState.workflow.bindingScope).toEqual({
        organizationId: "org_001",
        linearWorkspaceIdentityId: "linear_workspace_identity_001"
      });
      expect(unscoped).toBeNull();
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input?: {
  bindingScope?: {
    organizationId: string;
    linearWorkspaceIdentityId: string;
  } | null;
}) {
  const root = await mkdtemp(
    path.join(tmpdir(), "symphony-current-flow-session-loader-")
  );
  tempDirectories.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueStore = createSymphonyIssueStore(database.db);
  const routeWorkflowStore = createRouteWorkflowStore(database.db);
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore
  });
  const runtimePolicy = buildSymphonyRuntimePolicy();
  const issue = buildSymphonyTrackerIssue({
    state: "Todo"
  });

  if (input?.bindingScope) {
    seedHostedRepositoryWorkspaceBinding({
      database,
      organizationId: input.bindingScope.organizationId,
      linearWorkspaceIdentityId: input.bindingScope.linearWorkspaceIdentityId,
      repositoryWorkspaceBindingId: "repository_workspace_binding_001",
      githubRepositoryIdentityId: "github_repository_identity_001",
      repositoryKey: "openai/symphony",
      recordedAt: "2026-04-10T00:11:58.000Z"
    });
  }

  await issueStore.upsert(
    input?.bindingScope
      ? {
          trackerIssueKey: issue.identifier,
          trackerIssueId: issue.id,
          repositoryKey: "openai/symphony",
          bindingScope: input.bindingScope,
          repositoryWorkspaceBindingId: "repository_workspace_binding_001",
          latestRunStartedAt: null,
          recordedAt: "2026-04-10T00:11:59.000Z"
        }
      : {
          trackerIssueKey: issue.identifier,
          trackerIssueId: issue.id,
          repositoryKey: "openai/symphony",
          latestRunStartedAt: null,
          recordedAt: "2026-04-10T00:11:59.000Z"
        }
  );

  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T16:00:00.000Z")
  });
  const sessionLoader = await createRuntimeWorkflowSessionLoader({
    routeWorkflows,
    trackerConfig: runtimePolicy.tracker,
    bindingScope: input?.bindingScope ?? null,
    now: () => new Date("2026-04-10T16:00:00.000Z")
  });

  return {
    database,
    issue,
    runtimePolicy,
    routeWorkflows,
    routing,
    sessionLoader,
    close() {
      database.close();
    }
  };
}
