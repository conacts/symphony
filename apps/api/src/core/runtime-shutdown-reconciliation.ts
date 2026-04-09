import {
  createSqliteAgentAnalyticsStore,
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb
} from "@symphony/db";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import type { SymphonyTracker } from "@symphony/tracker";
import { SymphonyRuntimePollScheduler } from "./poll-scheduler.js";

export async function reconcilePersistedActiveRunsOnShutdown(input: {
  database: ReturnType<typeof initializeSymphonyDb>;
  tracker: SymphonyTracker;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  runStore: ReturnType<typeof createSqliteSymphonyRuntimeRunStore>;
  issueTimelineStore: ReturnType<typeof createSymphonyIssueTimelineStore>;
  runtimeLogStore: ReturnType<typeof createSymphonyRuntimeLogStore>;
  agentAnalyticsStore: ReturnType<typeof createSqliteAgentAnalyticsStore>;
  shutdownReason: string;
}): Promise<number> {
  const endedAt = new Date().toISOString();
  const activeRuns = input.database.client.prepare(`
    select runs.run_id as runId,
           issues.tracker_issue_id as trackerIssueId,
           runs.issue_identifier as issueIdentifier,
           runs.status as status
    from symphony_runs runs
    inner join symphony_issues issues
      on issues.issue_identifier = runs.issue_identifier
    where status in ('dispatching', 'running')
  `).all() as Array<{
    runId: string;
    trackerIssueId: string;
    issueIdentifier: string;
    status: "dispatching" | "running";
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
      tracker: input.tracker,
      runtimePolicy: input.runtimePolicy,
      trackedIssue,
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

    const runningAgentTurns = input.database.client.prepare(`
      select turn_id as turnId, thread_id as threadId, harness_kind as harnessKind, model, provider_id as providerId, provider_name as providerName,
             input_tokens as inputTokens, cached_input_tokens as cachedInputTokens, output_tokens as outputTokens
      from symphony_agent_turns
      where run_id = ? and status = 'running'
    `).all(run.runId) as Array<{
      turnId: string;
      threadId: string | null;
      harnessKind: "pi" | null;
      model: string | null;
      providerId: string | null;
      providerName: string | null;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
    }>;

    for (const turn of runningAgentTurns) {
      await input.agentAnalyticsStore.finalizeTurn({
        runId: run.runId,
        turnId: turn.turnId,
        threadId: turn.threadId,
        harnessKind: turn.harnessKind ?? "pi",
        model: turn.model,
        providerId: turn.providerId,
        providerName: turn.providerName,
        endedAt,
        status: "stopped",
        failureKind: "runtime_shutdown",
        failureMessagePreview: previewShutdownReason(input.shutdownReason),
        usage: {
          input_tokens: turn.inputTokens,
          cached_input_tokens: turn.cachedInputTokens,
          output_tokens: turn.outputTokens
        }
      });
    }

    const agentRun = input.database.client.prepare(`
      select thread_id as threadId
      from symphony_agent_runs
      where run_id = ?
    `).get(run.runId) as { threadId: string | null } | undefined;

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

    await input.agentAnalyticsStore.finalizeRun({
      runId: run.runId,
      status: "paused",
      endedAt,
      failureKind: "runtime_shutdown",
      failureOrigin: "runtime",
      failureMessagePreview: previewShutdownReason(input.shutdownReason),
      threadId: agentRun?.threadId ?? null
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
  tracker: SymphonyTracker;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  trackedIssue: Awaited<ReturnType<SymphonyTracker["fetchIssueStatesByIds"]>>[number] | null;
  issueTimelineStore: ReturnType<typeof createSymphonyIssueTimelineStore>;
  runId: string;
  endedAt: string;
  shutdownReason: string;
}): Promise<void> {
  if (!input.trackedIssue) {
    return;
  }

  const pauseState = input.runtimePolicy.tracker.pauseTransitionToState;

  if (
    !pauseState ||
    input.trackedIssue.state.trim().toLowerCase() === pauseState.trim().toLowerCase()
  ) {
    return;
  }

  try {
    await input.tracker.updateIssueState(input.trackedIssue.id, pauseState);
    await input.issueTimelineStore.record({
      issueIdentifier: input.trackedIssue.identifier,
      runId: input.runId,
      source: "tracker",
      eventType: "shutdown_pause_transition",
      message: "Issue moved to the paused state during runtime shutdown.",
      payload: {
        fromState: input.trackedIssue.state,
        toState: pauseState,
        shutdownReason: input.shutdownReason
      },
      recordedAt: input.endedAt
    });
  } catch {
    // Best-effort containment. The run is still reconciled locally even if tracker state fails.
  }
}

function previewShutdownReason(reason: string): string {
  return reason.length <= 280 ? reason : `${reason.slice(0, 279)}…`;
}
