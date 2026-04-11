import { afterEach, describe, expect, it } from "vitest";
import {
  createSymphonyIssueStore,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  createSqliteSymphonyRuntimeRunStore
} from "@symphony/db";
import {
  buildSymphonyTrackerIssue,
  createTempSymphonySqliteHarness,
  type SymphonyTempSqliteHarness
} from "@symphony/test-support";
import { createDbBackedOrchestratorObserver } from "./runtime-db-observer.js";
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
});

async function createObserverHarness() {
  const sqlite = await createTempSymphonySqliteHarness({
    rootPrefix: "symphony-runtime-db-observer-"
  });
  sqliteHarnesses.push(sqlite);

  const issue = buildSymphonyTrackerIssue({
    id: "issue-1",
    identifier: "SYM-101",
    state: "Bootstrapping"
  });
  const issueStore = createSymphonyIssueStore(sqlite.database.db);
  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey,
    latestRunStartedAt: null,
    recordedAt: "2026-04-09T21:54:00.000Z"
  });

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
    runId: "run-1",
    runMode: "implementation",
    status: "dispatching",
    startedAt: "2026-04-09T21:55:00.000Z"
  });

  const observer = createDbBackedOrchestratorObserver({
    admittedRepositories: [],
    runStore,
    issueTimelineStore,
    runtimeLogs: runtimeLogStore
  });

  return {
    issue,
    runId,
    observer,
    issueTimelineStore,
    runtimeLogStore
  };
}
