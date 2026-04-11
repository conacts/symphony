import {
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb
} from "@symphony/db";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { createDbBackedOrchestratorObserver } from "../core/runtime-db-observer.js";

export function createRuntimeDbObserverTestSupport(input: {
  dbFile: string;
  repositoryKey: string;
}) {
  const database = initializeSymphonyDb({
    dbFile: input.dbFile
  });
  const issueTimelineStore = createSymphonyIssueTimelineStore(database.db, {
    repositoryKey: input.repositoryKey
  });
  const runtimeLogStore = createSymphonyRuntimeLogStore(database.db, {
    repositoryKey: input.repositoryKey
  });
  const runStore = createSqliteSymphonyRuntimeRunStore({
    db: database.db,
    timelineStore: issueTimelineStore
  });

  return {
    issueTimelineStore,
    runtimeLogStore,
    runStore,
    observer: createDbBackedOrchestratorObserver({
      admittedRepositories: [],
      runStore,
      issueTimelineStore,
      runtimeLogs: runtimeLogStore
    })
  };
}

export function buildBootstrapInstallLifecycleEvent(input: {
  issue: SymphonyTrackerIssue;
  recordedAt: string;
  runId?: string | null;
}) {
  return {
    issue: input.issue,
    runId: input.runId ?? null,
    source: "workspace" as const,
    eventType: "workspace_manifest_step_started",
    message: "Manifest lifecycle step bootstrap/install started.",
    payload: {
      manifestLifecycle: {
        phase: "bootstrap",
        stepName: "install",
        command: "pnpm install --frozen-lockfile",
        cwd: "/workspace",
        timeoutMs: 30_000
      }
    },
    recordedAt: input.recordedAt
  };
}
