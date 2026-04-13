import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRouteWorkflowStore,
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyIssueStore,
  createSymphonyIssueTimelineStore,
  initializeSymphonyDb,
  symphonyGitHubInstallationIdentitiesTable,
  symphonyGitHubRepositoryIdentitiesTable,
  symphonyLinearWorkspaceIdentitiesTable,
  symphonyOrganizationsTable,
  symphonyRepositoryWorkspaceBindingsTable
} from "@symphony/db";
import {
  buildSymphonyRunStartAttrs,
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { expectRouteWorkflowAuthorityProof } from "../test-support/route-workflow-authority-test-support.js";
import { createRuntimeRouteLifecycleService } from "./runtime-route-lifecycle-service.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import { reconcilePersistedActiveRunsOnShutdown } from "./runtime-shutdown-reconciliation.js";
import { createDefaultRuntimeWorkflowPresetSelection } from "./runtime-workflow-preset-selection.js";

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

describe("runtime shutdown reconciliation", () => {
  it("routes persisted active runs into paused workflow history during shutdown", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-shutdown-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const issueTimelineStore = createSymphonyIssueTimelineStore(database.db, {
      repositoryKey: "openai/symphony"
    });
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db,
      timelineStore: issueTimelineStore
    });
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const issue = buildSymphonyTrackerIssue({
      state: "Todo"
    });
    const tracker = createMemorySymphonyTracker([issue]);

    try {
      await issueStore.upsert({
        issueIdentifier: issue.identifier,
        trackerIssueId: issue.id,
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:06:59.000Z"
      });

      const routeLifecycle = await createRuntimeRouteLifecycleService({
        routeWorkflows,
        tracker,
        trackerConfig: runtimePolicy.tracker,
        repositoryKey: "openai/symphony",
        presetSelection: createDefaultRuntimeWorkflowPresetSelection(),
        now: () => new Date("2026-04-10T14:30:00.000Z")
      });

      await routeLifecycle.workflowRoutingAdapter.routeDispatchBootstrap({
        issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T14:30:00.000Z"
      });
      const bootstrappingIssue = tracker.getIssue(issue.id);
      await routeLifecycle.workflowRoutingAdapter.activateRunStart({
        issue: bootstrappingIssue!,
        runId: "run-1",
        runMode: "implementation",
        threadId: "thread-1",
        workerHost: null,
        launchTarget: null,
        recordedAt: "2026-04-10T14:30:05.000Z"
      });

      await runStore.recordRunStarted(
        buildSymphonyRunStartAttrs({
          repositoryKey: "openai/symphony",
          trackerIssueId: issue.id,
          issueIdentifier: issue.identifier,
          runId: "run-1",
          runMode: "implementation",
          status: "running",
          startedAt: "2026-04-10T14:30:05.000Z"
        })
      );

      const reconciled = await reconcilePersistedActiveRunsOnShutdown({
        database,
        runStore,
        routeLifecycle,
        shutdownReason: "runtime_shutdown",
        bindingScope: null
      });

      expect(reconciled).toBe(1);
      expect(tracker.getIssue(issue.id)?.state).toBe("Paused");

      await expectRouteWorkflowAuthorityProof({
        routeWorkflows,
        issueIdentifier: issue.identifier,
        currentNode: "paused",
        reasonCode: "implementation_shutdown_paused",
        signalType: "runtime.shutdown_requested"
      });

      const issueTimeline = await issueTimelineStore.listIssueTimeline(
        issue.identifier,
        {
          limit: 20
        }
      );
      expect(issueTimeline.map((entry) => entry.eventType)).toEqual(
        expect.arrayContaining(["runtime_shutdown_reconciled"])
      );
    } finally {
      database.close();
    }
  });

  it("only reconciles persisted active runs inside the active hosted workspace scope", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "symphony-runtime-shutdown-scoped-")
    );
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const routeShutdownPause = vi.fn().mockResolvedValue(false);

    try {
      seedHostedRepositoryWorkspaceBinding({
        database,
        organizationId: "org-1",
        linearWorkspaceIdentityId: "workspace-1",
        repositoryWorkspaceBindingId: "binding-1",
        githubRepositoryIdentityId: "github-repo-1",
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-10T14:30:00.000Z"
      });
      seedHostedRepositoryWorkspaceBinding({
        database,
        organizationId: "org-2",
        linearWorkspaceIdentityId: "workspace-2",
        repositoryWorkspaceBindingId: "binding-2",
        githubRepositoryIdentityId: "github-repo-2",
        repositoryKey: "openai/coldets",
        recordedAt: "2026-04-10T14:30:00.000Z"
      });

      await issueStore.upsert({
        issueIdentifier: "SYM-600",
        trackerIssueId: "tracker-600",
        repositoryKey: "openai/symphony",
        bindingScope: {
          organizationId: "org-1",
          linearWorkspaceIdentityId: "workspace-1"
        },
        repositoryWorkspaceBindingId: "binding-1",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T14:31:00.000Z"
      });
      await issueStore.upsert({
        issueIdentifier: "SYM-601",
        trackerIssueId: "tracker-601",
        repositoryKey: "openai/coldets",
        bindingScope: {
          organizationId: "org-2",
          linearWorkspaceIdentityId: "workspace-2"
        },
        repositoryWorkspaceBindingId: "binding-2",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T14:31:00.000Z"
      });

      await runStore.recordRunStarted(
        buildSymphonyRunStartAttrs({
          repositoryKey: "openai/symphony",
          trackerIssueId: "tracker-600",
          issueIdentifier: "SYM-600",
          runId: "run-600",
          bindingScope: {
            organizationId: "org-1",
            linearWorkspaceIdentityId: "workspace-1"
          },
          startedAt: "2026-04-10T14:32:00.000Z"
        })
      );
      await runStore.recordRunStarted(
        buildSymphonyRunStartAttrs({
          repositoryKey: "openai/coldets",
          trackerIssueId: "tracker-601",
          issueIdentifier: "SYM-601",
          runId: "run-601",
          bindingScope: {
            organizationId: "org-2",
            linearWorkspaceIdentityId: "workspace-2"
          },
          startedAt: "2026-04-10T14:33:00.000Z"
        })
      );

      const reconciled = await reconcilePersistedActiveRunsOnShutdown({
        database,
        runStore,
        routeLifecycle: {
          routeShutdownPause
        },
        shutdownReason: "runtime_shutdown",
        bindingScope: {
          organizationId: "org-1",
          linearWorkspaceIdentityId: "workspace-1"
        }
      });

      expect(reconciled).toBe(1);
      expect(routeShutdownPause).toHaveBeenCalledTimes(1);
      expect(routeShutdownPause).toHaveBeenCalledWith({
        issueIdentifier: "SYM-600",
        runId: "run-600",
        runMode: "implementation",
        recordedAt: expect.any(String),
        reason: "runtime_shutdown"
      });

      const runs = database.client.prepare(`
        select run_id as runId, status
        from symphony_runs
        order by run_id asc
      `).all() as Array<{
        runId: string;
        status: string;
      }>;

      expect(runs).toEqual([
        {
          runId: "run-600",
          status: "paused"
        },
        {
          runId: "run-601",
          status: "running"
        }
      ]);
    } finally {
      database.close();
    }
  });
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
