import {
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb
} from "@symphony/db";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import { z } from "zod";
import { SymphonyRuntimePollScheduler } from "./poll-scheduler.js";
import type { SymphonyRuntimeRouteLifecycleService } from "./runtime-route-lifecycle-service.js";

const persistedRunModeSchema = z.enum(["implementation"]);

export async function reconcilePersistedActiveRunsOnShutdown(input: {
  database: ReturnType<typeof initializeSymphonyDb>;
  runStore: ReturnType<typeof createSqliteSymphonyRuntimeRunStore>;
  routeLifecycle: Pick<SymphonyRuntimeRouteLifecycleService, "routeShutdownPause">;
  shutdownReason: string;
}): Promise<number> {
  const endedAt = new Date().toISOString();
  // Shutdown recovery only needs the persisted run identity plus issueIdentifier.
  // Lifecycle routing resolves the current tracker issue through workflow-backed routing,
  // so this query no longer joins symphony_issues or preloads tracker-owned state.
  const activeRuns = input.database.client.prepare(`
    select runs.run_id as runId,
           runs.repository_key as repositoryKey,
           runs.issue_identifier as issueIdentifier,
           runs.status as status,
           runs.run_mode as runMode
    from symphony_runs runs
    where status in ('dispatching', 'running')
  `).all() as Array<{
    runId: string;
    repositoryKey: string;
    issueIdentifier: string;
    status: "dispatching" | "running";
    runMode: string | null;
  }>;

  if (activeRuns.length === 0) {
    return 0;
  }
  const issueTimelineStores = new Map<string, ReturnType<typeof createSymphonyIssueTimelineStore>>();
  const runtimeLogStores = new Map<string, ReturnType<typeof createSymphonyRuntimeLogStore>>();

  for (const run of activeRuns) {
    await reconcileTrackerIssueOnShutdown({
      routeLifecycle: input.routeLifecycle,
      issueIdentifier: run.issueIdentifier,
      runMode: readPersistedRunMode(run.runMode),
      runId: run.runId,
      endedAt,
      shutdownReason: input.shutdownReason
    });

    const runningTurns = input.database.client.prepare(`
      select turn_id as turnId
      from symphony_turns
      where run_id = ? and status = 'running'
    `).all(run.runId) as Array<{ turnId: string }>;

    for (const turn of runningTurns) {
      await input.runStore.finalizeTurn(turn.turnId, {
        status: "stopped",
        endedAt,
        metadata: {
          stopReason: "runtime_shutdown"
        }
      });
    }

    await input.runStore.finalizeRun(run.runId, {
      status: "paused",
      outcome: "runtime_shutdown",
      endedAt,
      errorClass: "runtime_shutdown",
      errorMessage: input.shutdownReason,
      metadata: {
        shutdown: {
          previousStatus: run.status,
          reason: "runtime_shutdown"
        }
      }
    });

    const issueTimelineStore =
      issueTimelineStores.get(run.repositoryKey) ??
      createAndCacheIssueTimelineStore({
        cache: issueTimelineStores,
        db: input.database.db,
        repositoryKey: run.repositoryKey
      });
    await issueTimelineStore.record({
      issueIdentifier: run.issueIdentifier,
      runId: run.runId,
      source: "runtime",
      eventType: "runtime_shutdown_reconciled",
      message: "Runtime shutdown reconciled an active run into a paused state.",
      payload: {
        previousStatus: run.status,
        shutdownReason: input.shutdownReason
      },
      recordedAt: endedAt
    });

    const runtimeLogStore =
      runtimeLogStores.get(run.repositoryKey) ??
      createAndCacheRuntimeLogStore({
        cache: runtimeLogStores,
        db: input.database.db,
        repositoryKey: run.repositoryKey
      });
    await runtimeLogStore.record({
      level: "warn",
      source: "runtime",
      eventType: "runtime_shutdown_reconciled_run",
      message: "Reconciled an active persisted run during shutdown.",
      issueIdentifier: run.issueIdentifier,
      runId: run.runId,
      payload: {
        previousStatus: run.status
      },
      recordedAt: endedAt
    });
  }

  return activeRuns.length;
}

export async function waitForPollSchedulerDrain(
  pollScheduler: SymphonyRuntimePollScheduler | null
): Promise<void> {
  if (!pollScheduler) {
    return;
  }

  const startedAt = Date.now();

  while (pollScheduler.snapshot().inFlight) {
    if (Date.now() - startedAt > 2_000) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

async function reconcileTrackerIssueOnShutdown(input: {
  routeLifecycle: Pick<SymphonyRuntimeRouteLifecycleService, "routeShutdownPause">;
  issueIdentifier: string;
  runMode: SymphonyRunMode;
  runId: string;
  endedAt: string;
  shutdownReason: string;
}): Promise<void> {
  try {
    const routed = await input.routeLifecycle.routeShutdownPause({
      issueIdentifier: input.issueIdentifier,
      runId: input.runId,
      runMode: input.runMode,
      recordedAt: input.endedAt,
      reason: input.shutdownReason
    });
    if (!routed) {
      return;
    }
  } catch {
    // Best-effort containment. The run is still reconciled locally even if tracker state fails.
  }
}

function readPersistedRunMode(runMode: string | null): SymphonyRunMode {
  if (!runMode) {
    throw new TypeError("Persisted active run is missing run_mode.");
  }

  return persistedRunModeSchema.parse(runMode);
}

function createAndCacheIssueTimelineStore(input: {
  cache: Map<string, ReturnType<typeof createSymphonyIssueTimelineStore>>;
  db: ReturnType<typeof initializeSymphonyDb>["db"];
  repositoryKey: string;
}) {
  const store = createSymphonyIssueTimelineStore(input.db, {
    repositoryKey: input.repositoryKey
  });
  input.cache.set(input.repositoryKey, store);
  return store;
}

function createAndCacheRuntimeLogStore(input: {
  cache: Map<string, ReturnType<typeof createSymphonyRuntimeLogStore>>;
  db: ReturnType<typeof initializeSymphonyDb>["db"];
  repositoryKey: string;
}) {
  const store = createSymphonyRuntimeLogStore(input.db, {
    repositoryKey: input.repositoryKey
  });
  input.cache.set(input.repositoryKey, store);
  return store;
}
