import {
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb
} from "@symphony/db";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type { SymphonyTracker } from "@symphony/tracker";
import { SymphonyRuntimePollScheduler } from "./poll-scheduler.js";
import type { SymphonyRuntimeRouteLifecycleService } from "./runtime-route-lifecycle-service.js";

export async function reconcilePersistedActiveRunsOnShutdown(input: {
  database: ReturnType<typeof initializeSymphonyDb>;
  tracker: SymphonyTracker;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  runStore: ReturnType<typeof createSqliteSymphonyRuntimeRunStore>;
  issueTimelineStore: ReturnType<typeof createSymphonyIssueTimelineStore>;
  runtimeLogStore: ReturnType<typeof createSymphonyRuntimeLogStore>;
  routeLifecycle: Pick<SymphonyRuntimeRouteLifecycleService, "routeShutdownPause">;
  shutdownReason: string;
}): Promise<number> {
  const endedAt = new Date().toISOString();
  const activeRuns = input.database.client.prepare(`
    select runs.run_id as runId,
           issues.tracker_issue_id as trackerIssueId,
           runs.issue_identifier as issueIdentifier,
           runs.status as status,
           runs.metadata as metadataJson
    from symphony_runs runs
    inner join symphony_issues issues
      on issues.issue_identifier = runs.issue_identifier
    where status in ('dispatching', 'running')
  `).all() as Array<{
    runId: string;
    trackerIssueId: string;
    issueIdentifier: string;
    status: "dispatching" | "running";
    metadataJson: string | null;
  }>;

  if (activeRuns.length === 0) {
    return 0;
  }

  const issueIds = [...new Set(activeRuns.map((run) => run.trackerIssueId))];
  const trackedIssues = await input.tracker.fetchIssueStatesByIds(
    input.runtimePolicy.tracker,
    issueIds
  );
  const trackedIssuesById = new Map(
    trackedIssues.map((issue) => [issue.id, issue] as const)
  );

  for (const run of activeRuns) {
    const trackedIssue = trackedIssuesById.get(run.trackerIssueId) ?? null;

    await reconcileTrackerIssueOnShutdown({
      routeLifecycle: input.routeLifecycle,
      trackedIssue,
      runMode: readPersistedRunMode(run.metadataJson),
      issueTimelineStore: input.issueTimelineStore,
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

    await input.issueTimelineStore.record({
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

    await input.runtimeLogStore.record({
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
  trackedIssue: Awaited<ReturnType<SymphonyTracker["fetchIssueStatesByIds"]>>[number] | null;
  runMode: SymphonyRunMode;
  issueTimelineStore: ReturnType<typeof createSymphonyIssueTimelineStore>;
  runId: string;
  endedAt: string;
  shutdownReason: string;
}): Promise<void> {
  if (!input.trackedIssue) {
    return;
  }

  try {
    const routed = await input.routeLifecycle.routeShutdownPause({
      issueIdentifier: input.trackedIssue.identifier,
      runId: input.runId,
      runMode: input.runMode,
      recordedAt: input.endedAt,
      reason: input.shutdownReason
    });
    if (!routed) {
      return;
    }

    await input.issueTimelineStore.record({
      issueIdentifier: input.trackedIssue.identifier,
      runId: input.runId,
      source: "tracker",
      eventType: "shutdown_pause_transition",
      message: "Issue moved to the paused state during runtime shutdown.",
      payload: {
        fromState: input.trackedIssue.state,
        toState: "Paused",
        shutdownReason: input.shutdownReason
      },
      recordedAt: input.endedAt
    });
  } catch {
    // Best-effort containment. The run is still reconciled locally even if tracker state fails.
  }
}

function readPersistedRunMode(metadataJson: string | null): SymphonyRunMode {
  if (!metadataJson) {
    throw new TypeError("Persisted active run is missing metadata.runMode.");
  }

  const metadata = JSON.parse(metadataJson) as {
    runMode?: unknown;
  };
  if (
    metadata.runMode !== "implementation" &&
    metadata.runMode !== "rework" &&
    metadata.runMode !== "approved_merge"
  ) {
    throw new TypeError("Persisted active run is missing a supported metadata.runMode.");
  }

  return metadata.runMode;
}
