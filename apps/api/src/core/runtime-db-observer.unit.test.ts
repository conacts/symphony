import { afterEach, describe, expect, it } from "vitest";
import {
  createSymphonyIssueStore,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  createSqliteSymphonyRuntimeRunStore,
  symphonyGitHubInstallationIdentitiesTable,
  symphonyGitHubRepositoryIdentitiesTable,
  symphonyLinearWorkspaceIdentitiesTable,
  symphonyOrganizationsTable,
  symphonyRepositoryWorkspaceBindingsTable,
  type SymphonyLifecycleBindingScope
} from "@symphony/db";
import {
  buildSymphonyTrackerIssue,
  createTempSymphonySqliteHarness,
  type SymphonyTempSqliteHarness
} from "@symphony/test-support";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import { createDbBackedOrchestratorObserver } from "./runtime-db-observer.js";
import {
  createRepositoryAwareIssueTimelineStore,
  createRepositoryAwareRuntimeLogStore
} from "./runtime-observability-store-routing.js";
import { buildBootstrapInstallLifecycleEvent } from "../test-support/runtime-lifecycle-test-support.js";

const repositoryKey = "openai/symphony";
const sqliteHarnesses: SymphonyTempSqliteHarness[] = [];

afterEach(async () => {
  await Promise.all(sqliteHarnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("runtime db observer", () => {
  it("fails closed when no admitted repositories are available for run start", async () => {
    const harness = await createObserverHarness();

    await expect(
      harness.observer.startRun({
        issue: harness.issue,
        attempt: 1,
        harness: "pi",
        workspace: null,
        workerHost: "worker-1",
        startedAt: "2026-04-09T22:10:00.000Z",
        runMode: "implementation"
      })
    ).rejects.toThrow("At least one admitted repository is required.");
  });

  it("mirrors bootstrap lifecycle step events into runtime logs", async () => {
    const harness = await createObserverHarness();
    const recordedAt = "2026-04-09T22:00:00.000Z";

    await harness.observer.recordLifecycleEvent(
      buildBootstrapInstallLifecycleEvent({
        issue: harness.issue,
        runId: harness.runId,
        recordedAt
      })
    );

    const timeline = await harness.issueTimelineStore.listIssueTimeline(
      harness.issue.identifier
    );
    expect(
      timeline.some((entry) => entry.eventType === "workspace_manifest_step_started")
    ).toBe(true);

    const runtimeLogs = await harness.runtimeLogStore.list({
      issueIdentifier: harness.issue.identifier
    });
    expect(runtimeLogs).toContainEqual(
      expect.objectContaining({
        level: "info",
        source: "workspace",
        eventType: "workspace_manifest_step_started",
        message: "Manifest lifecycle step bootstrap/install started.",
        issueIdentifier: harness.issue.identifier,
        runId: harness.runId,
        recordedAt,
        payload: {
          manifestLifecycle: {
            phase: "bootstrap",
            stepName: "install",
            command: "pnpm install --frozen-lockfile",
            cwd: "/workspace",
            timeoutMs: 30_000
          }
        }
      })
    );
  });

  it("records lifecycle events without a run id into runtime logs", async () => {
    const harness = await createObserverHarness();
    const recordedAt = "2026-04-09T22:02:00.000Z";

    await harness.observer.recordLifecycleEvent({
      issue: harness.issue,
      runId: null,
      source: "workspace",
      eventType: "workspace_manifest_phase_started",
      message: "Manifest lifecycle phase bootstrap started.",
      payload: {
        manifestLifecycle: {
          phase: "bootstrap",
          status: "running"
        }
      },
      recordedAt
    });

    const runtimeLogs = await harness.runtimeLogStore.list({
      issueIdentifier: harness.issue.identifier
    });
    expect(runtimeLogs).toContainEqual(
      expect.objectContaining({
        level: "info",
        source: "workspace",
        eventType: "workspace_manifest_phase_started",
        message: "Manifest lifecycle phase bootstrap started.",
        issueIdentifier: harness.issue.identifier,
        runId: null,
        recordedAt,
        payload: {
          manifestLifecycle: {
            phase: "bootstrap",
            status: "running"
          }
        }
      })
    );
  });

  it("records startup failures as error-level runtime logs", async () => {
    const harness = await createObserverHarness();

    await harness.observer.recordLifecycleEvent({
      issue: harness.issue,
      runId: harness.runId,
      source: "orchestrator",
      eventType: "runtime_startup_failed",
      message: "Dispatch failed before the agent run became active.",
      payload: {
        reason: "workspace bootstrap failed",
        failureStage: "workspace_prepare",
        failureOrigin: "workspace_lifecycle",
        manifestLifecyclePhase: "bootstrap",
        manifestLifecycleStepName: "install",
        manifestLifecycle: {
          phases: [
            {
              phase: "bootstrap",
              status: "failed"
            }
          ]
        }
      },
      recordedAt: "2026-04-09T22:05:00.000Z"
    });

    const runtimeLogs = await harness.runtimeLogStore.list({
      issueIdentifier: harness.issue.identifier
    });
    expect(runtimeLogs).toContainEqual(
      expect.objectContaining({
        level: "error",
        source: "orchestrator",
        eventType: "runtime_startup_failed",
        issueIdentifier: harness.issue.identifier,
        runId: harness.runId,
        payload: expect.objectContaining({
          reason: "workspace bootstrap failed",
          failureStage: "workspace_prepare",
          failureOrigin: "workspace_lifecycle",
          manifestLifecyclePhase: "bootstrap",
          manifestLifecycleStepName: "install"
        })
      })
    );
  });

  it("records non-failed orchestrator lifecycle events as info-level runtime logs", async () => {
    const harness = await createObserverHarness();
    const recordedAt = "2026-04-09T22:03:00.000Z";

    await harness.observer.recordLifecycleEvent({
      issue: harness.issue,
      runId: harness.runId,
      source: "orchestrator",
      eventType: "runtime_launch_requested",
      message: "Requested launch of the runtime worker.",
      payload: {
        workerHost: "worker-1",
        threadId: "thread-1",
        launchTarget: {
          kind: "workspace"
        }
      },
      recordedAt
    });

    const runtimeLogs = await harness.runtimeLogStore.list({
      issueIdentifier: harness.issue.identifier
    });
    expect(runtimeLogs).toContainEqual(
      expect.objectContaining({
        level: "info",
        source: "orchestrator",
        eventType: "runtime_launch_requested",
        message: "Requested launch of the runtime worker.",
        issueIdentifier: harness.issue.identifier,
        runId: harness.runId,
        recordedAt,
        payload: {
          workerHost: "worker-1",
          threadId: "thread-1",
          launchTarget: {
            kind: "workspace"
          }
        }
      })
    );
  });

  it("threads hosted workspace scope into run-start persistence", async () => {
    const harness = await createObserverHarness({
      seedActiveRun: false,
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "workspace-1"
      }
    });
    const observer = createDbBackedOrchestratorObserver({
      admittedRepositories: [
        {
          repositoryKey,
          repoRoot: "/tmp/openai-symphony",
          linearBinding: {
            teamKey: harness.issue.teamKey
          }
        }
      ] as AdmittedRuntimeRepository[],
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "workspace-1"
      },
      runStore: harness.runStore,
      issueTimelineStore: harness.issueTimelineStore,
      runtimeLogs: harness.runtimeLogStore
    });

    const runId = await observer.startRun({
      issue: harness.issue,
      attempt: 2,
      harness: "pi",
      workspace: null,
      workerHost: "worker-1",
      startedAt: "2026-04-09T22:10:00.000Z",
      runMode: "implementation"
    });

    const storedRun = harness.sqlite.database.client.prepare(`
      select
        organization_id as organizationId,
        linear_workspace_identity_id as linearWorkspaceIdentityId
      from symphony_runs
      where run_id = ?
    `).get(runId) as {
      organizationId: string | null;
      linearWorkspaceIdentityId: string | null;
    };

    expect(storedRun?.organizationId).toBe("org-1");
    expect(storedRun?.linearWorkspaceIdentityId).toBe("workspace-1");
  });

  it("routes lifecycle observability writes through the issue-resolved repository in multi-repo runtimes", async () => {
    const sqlite = await createTempSymphonySqliteHarness({
      rootPrefix: "symphony-runtime-db-observer-multi-repo-"
    });
    sqliteHarnesses.push(sqlite);
    const issueStore = createSymphonyIssueStore(sqlite.database.db);
    const issue = buildSymphonyTrackerIssue({
      id: "issue-coldets-1",
      identifier: "COL-901",
      state: "Bootstrapping",
      teamKey: "COL"
    });

    await issueStore.upsert({
      issueIdentifier: issue.identifier,
      trackerIssueId: issue.id,
      repositoryKey: "conacts/coldets-v2",
      latestRunStartedAt: null,
      recordedAt: "2026-04-12T22:30:00.000Z"
    });

    const timelineStore = createRepositoryAwareIssueTimelineStore({
      db: sqlite.database.db,
      issueStore,
      defaultRepositoryKey: "conacts/symphony"
    });
    const runtimeLogStore = createRepositoryAwareRuntimeLogStore({
      db: sqlite.database.db,
      issueStore,
      defaultRepositoryKey: "conacts/symphony",
      repositoryKeys: ["conacts/symphony", "conacts/coldets-v2"]
    });
    const coldetsTimelineStore = createSymphonyIssueTimelineStore(sqlite.database.db, {
      repositoryKey: "conacts/coldets-v2"
    });
    const defaultTimelineStore = createSymphonyIssueTimelineStore(sqlite.database.db, {
      repositoryKey
    });
    const coldetsRuntimeLogStore = createSymphonyRuntimeLogStore(sqlite.database.db, {
      repositoryKey: "conacts/coldets-v2"
    });
    const defaultRuntimeLogStore = createSymphonyRuntimeLogStore(sqlite.database.db, {
      repositoryKey
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: sqlite.database.db,
      timelineStore
    });
    const observer = createDbBackedOrchestratorObserver({
      admittedRepositories: [
        {
          repositoryKey,
          repoRoot: "/tmp/openai-symphony",
          linearBinding: {
            teamKey: "SYM"
          }
        },
        {
          repositoryKey: "conacts/coldets-v2",
          repoRoot: "/tmp/conacts-coldets",
          linearBinding: {
            teamKey: "COL"
          }
        }
      ] as AdmittedRuntimeRepository[],
      runStore,
      issueTimelineStore: timelineStore,
      runtimeLogs: runtimeLogStore
    });

    await observer.recordLifecycleEvent({
      issue,
      runId: null,
      source: "workspace",
      eventType: "workspace_manifest_phase_started",
      message: "Manifest lifecycle phase bootstrap started.",
      payload: {
        manifestLifecycle: {
          phase: "bootstrap",
          status: "running"
        }
      },
      recordedAt: "2026-04-12T22:30:01.000Z"
    });

    await expect(
      coldetsTimelineStore.listIssueTimeline(issue.identifier)
    ).resolves.toEqual([
      expect.objectContaining({
        repositoryKey: "conacts/coldets-v2",
        issueIdentifier: issue.identifier,
        eventType: "workspace_manifest_phase_started"
      })
    ]);
    await expect(
      defaultTimelineStore.listIssueTimeline(issue.identifier)
    ).resolves.toEqual([]);
    await expect(
      coldetsRuntimeLogStore.list({
        issueIdentifier: issue.identifier
      })
    ).resolves.toEqual([
      expect.objectContaining({
        repositoryKey: "conacts/coldets-v2",
        issueIdentifier: issue.identifier,
        eventType: "workspace_manifest_phase_started"
      })
    ]);
    await expect(
      defaultRuntimeLogStore.list({
        issueIdentifier: issue.identifier
      })
    ).resolves.toEqual([]);
  });
});

async function createObserverHarness(input?: {
  seedActiveRun?: boolean;
  bindingScope?: SymphonyLifecycleBindingScope | null;
}) {
  const sqlite = await createTempSymphonySqliteHarness({
    rootPrefix: "symphony-runtime-db-observer-"
  });
  sqliteHarnesses.push(sqlite);

  const issue = buildSymphonyTrackerIssue({
    id: "issue-1",
    identifier: "SYM-101",
    state: "Bootstrapping"
  });
  const repositoryWorkspaceBindingId =
    input?.bindingScope === undefined || input.bindingScope === null
      ? null
      : seedHostedRepositoryWorkspaceBinding({
          sqlite,
          organizationId: input.bindingScope.organizationId,
          linearWorkspaceIdentityId: input.bindingScope.linearWorkspaceIdentityId,
          repositoryKey,
          recordedAt: "2026-04-09T21:53:00.000Z"
        });
  const issueStore = createSymphonyIssueStore(sqlite.database.db);
  await issueStore.upsert(
    repositoryWorkspaceBindingId === null
      ? {
          issueIdentifier: issue.identifier,
          trackerIssueId: issue.id,
          repositoryKey,
          latestRunStartedAt: null,
          recordedAt: "2026-04-09T21:54:00.000Z"
        }
      : {
          issueIdentifier: issue.identifier,
          trackerIssueId: issue.id,
          repositoryKey,
          bindingScope: input!.bindingScope!,
          repositoryWorkspaceBindingId,
          latestRunStartedAt: null,
          recordedAt: "2026-04-09T21:54:00.000Z"
        }
  );

  const issueTimelineStore = createSymphonyIssueTimelineStore(sqlite.database.db, {
    repositoryKey
  });
  const runtimeLogStore = createSymphonyRuntimeLogStore(sqlite.database.db, {
    repositoryKey
  });
  const runStore = createSqliteSymphonyRuntimeRunStore({
    db: sqlite.database.db,
    timelineStore: issueTimelineStore
  });
  const runId = await runStore.recordRunStarted({
    repositoryKey,
    trackerIssueId: issue.id,
    issueIdentifier: issue.identifier,
    bindingScope: input?.bindingScope ?? null,
    runId: "run-1",
    runMode: "implementation",
    status: "dispatching",
    startedAt: "2026-04-09T21:55:00.000Z"
  });
  if (input?.seedActiveRun === false) {
    await runStore.finalizeRun(runId, {
      status: "stopped",
      outcome: "run_stopped_terminal",
      endedAt: "2026-04-09T21:56:00.000Z"
    });
  }

  const observer = createDbBackedOrchestratorObserver({
    admittedRepositories: [],
    bindingScope: input?.bindingScope ?? null,
    runStore,
    issueTimelineStore,
    runtimeLogs: runtimeLogStore
  });

  return {
    sqlite,
    issue,
    runId,
    observer,
    runStore,
    issueTimelineStore,
    runtimeLogStore
  };
}

function seedHostedRepositoryWorkspaceBinding(input: {
  sqlite: SymphonyTempSqliteHarness;
  organizationId: string;
  linearWorkspaceIdentityId: string;
  repositoryKey: string;
  recordedAt: string;
}): string {
  const repositoryWorkspaceBindingId = `binding_${input.organizationId}_${input.linearWorkspaceIdentityId}`;
  const githubRepositoryIdentityId = `github_repo_${input.organizationId}_${input.linearWorkspaceIdentityId}`;
  const githubInstallationIdentityId = `github_installation_${input.organizationId}`;

  input.sqlite.database.db.insert(symphonyOrganizationsTable).values({
    organizationId: input.organizationId,
    organizationSlug: input.organizationId,
    displayName: input.organizationId,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.sqlite.database.db.insert(symphonyGitHubInstallationIdentitiesTable).values({
    githubInstallationIdentityId,
    organizationId: input.organizationId,
    provider: "github",
    githubInstallationId: `${githubInstallationIdentityId}_id`,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.sqlite.database.db.insert(symphonyGitHubRepositoryIdentitiesTable).values({
    githubRepositoryIdentityId,
    organizationId: input.organizationId,
    githubInstallationIdentityId,
    provider: "github",
    repositoryKey: input.repositoryKey,
    githubRepositoryId: `${githubRepositoryIdentityId}_id`,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.sqlite.database.db.insert(symphonyLinearWorkspaceIdentitiesTable).values({
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    organizationId: input.organizationId,
    provider: "linear",
    linearWorkspaceId: `${input.linearWorkspaceIdentityId}_id`,
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  input.sqlite.database.db.insert(symphonyRepositoryWorkspaceBindingsTable).values({
    repositoryWorkspaceBindingId,
    organizationId: input.organizationId,
    githubInstallationIdentityId,
    githubRepositoryIdentityId,
    linearWorkspaceIdentityId: input.linearWorkspaceIdentityId,
    source: "bootstrap",
    status: "active",
    insertedAt: input.recordedAt,
    updatedAt: input.recordedAt
  }).onConflictDoNothing().run();

  return repositoryWorkspaceBindingId;
}
