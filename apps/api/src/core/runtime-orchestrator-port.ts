import type { SymphonyLogger } from "@symphony/logger";
import type { SymphonyRuntimeLogStore } from "@symphony/db";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import {
  publishRealtimeSnapshotDiff,
  snapshotRequiresRealtimeInvalidation
} from "./runtime-realtime-diff.js";
import type { SymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";
import type {
  SymphonyRuntimeOrchestratorPort
} from "./runtime-app-types.js";
import type { SymphonyOrchestratorSnapshot } from "@symphony/orchestrator";

export function createRuntimeOrchestratorPort(input: {
  runtime: Pick<
    SymphonyRuntimeDriver,
    "snapshot" | "runPollCycle" | "dispatchIssue"
  >;
  logger: SymphonyLogger;
  runtimeLogs: SymphonyRuntimeLogStore;
  realtime: SymphonyRealtimeHub;
  beforePollCycle?(
    snapshot: SymphonyOrchestratorSnapshot
  ): Promise<void> | void;
}): SymphonyRuntimeOrchestratorPort {
  let inFlightPollCycle: Promise<SymphonyOrchestratorSnapshot> | null = null;
  let runningBeforePollCycle = false;
  let manualRefreshQueued = false;
  let manualRefreshDrainScheduled = false;

  const scheduleQueuedManualRefreshDrain = (): void => {
    if (manualRefreshDrainScheduled) {
      return;
    }

    manualRefreshDrainScheduled = true;
    setImmediate(() => {
      manualRefreshDrainScheduled = false;
      void drainQueuedManualRefresh();
    });
  };

  const drainQueuedManualRefresh = async (): Promise<void> => {
    if (!manualRefreshQueued || inFlightPollCycle) {
      return;
    }

    manualRefreshQueued = false;

    try {
      await port.runPollCycle();
    } catch (error) {
      input.logger.error("Queued manual refresh poll cycle failed", {
        error
      });
    }
  };

  const port: SymphonyRuntimeOrchestratorPort = {
    snapshot() {
      return input.runtime.snapshot();
    },

    isPollCycleInFlight() {
      return inFlightPollCycle !== null;
    },

    async requestRefresh() {
      const requestedAt = new Date().toISOString();
      const coalesced = manualRefreshQueued;
      manualRefreshQueued = true;

      input.logger.info(
        coalesced ? "Manual refresh request coalesced" : "Manual refresh queued",
        {
          coalesced
        }
      );
      await input.runtimeLogs.record({
        level: "info",
        source: "runtime",
        eventType: coalesced
          ? "manual_refresh_coalesced"
          : "manual_refresh_queued",
        message: coalesced
          ? "Coalesced manual refresh request."
          : "Queued manual refresh request.",
        payload: {
          coalesced
        },
        recordedAt: requestedAt
      });
      scheduleQueuedManualRefreshDrain();

      return {
        queued: true,
        coalesced,
        requestedAt,
        operations: ["poll", "reconcile"]
      };
    },

    async dispatchRoutedIssue(dispatchInput) {
      while (inFlightPollCycle && !runningBeforePollCycle) {
        await inFlightPollCycle;
      }

      const claimedIssueIds = new Set(input.runtime.snapshot().claimedIssueIds);
      if (claimedIssueIds.has(dispatchInput.issue.id)) {
        await input.runtimeLogs.record({
          level: "info",
          source: "runtime",
          eventType: "routed_dispatch_skipped_claimed",
          message: "Skipped routed dispatch because the issue is already claimed.",
          issueIdentifier: dispatchInput.issue.identifier,
          payload: {
            workflowId: dispatchInput.workflowId,
            commandId: dispatchInput.commandId,
            runMode: dispatchInput.runMode
          },
          recordedAt: dispatchInput.recordedAt
        });
        return;
      }

      try {
        await input.runtime.dispatchIssue(
          dispatchInput.issue,
          1,
          null,
          dispatchInput.runMode
        );
        await input.runtimeLogs.record({
          level: "info",
          source: "runtime",
          eventType: "routed_dispatch_started",
          message: "Started routed issue dispatch directly from workflow history.",
          issueIdentifier: dispatchInput.issue.identifier,
          payload: {
            workflowId: dispatchInput.workflowId,
            commandId: dispatchInput.commandId,
            runMode: dispatchInput.runMode
          },
          recordedAt: dispatchInput.recordedAt
        });
      } catch (error) {
        await input.runtimeLogs.record({
          level: "error",
          source: "runtime",
          eventType: "routed_dispatch_failed",
          message: "Routed issue dispatch failed.",
          issueIdentifier: dispatchInput.issue.identifier,
          payload: {
            workflowId: dispatchInput.workflowId,
            commandId: dispatchInput.commandId,
            runMode: dispatchInput.runMode,
            error: error instanceof Error ? error.message : String(error)
          },
          recordedAt: dispatchInput.recordedAt
        });
        throw error;
      }
    },

    async runPollCycle() {
      if (inFlightPollCycle) {
        return await inFlightPollCycle;
      }

      const snapshotBeforePreparation = input.runtime.snapshot();
      inFlightPollCycle = (async () => {
        runningBeforePollCycle = true;
        try {
          await input.beforePollCycle?.(snapshotBeforePreparation);
        } finally {
          runningBeforePollCycle = false;
        }
        const previousSnapshot = input.runtime.snapshot();
        input.logger.info("Starting orchestrator poll cycle", {
          runningCount: previousSnapshot.running.length,
          retryingCount: previousSnapshot.retrying.length
        });

        try {
          const nextSnapshot = await input.runtime.runPollCycle();
          const changed = snapshotRequiresRealtimeInvalidation(
            previousSnapshot,
            nextSnapshot
          );

          input.logger.info("Finished orchestrator poll cycle", {
            runningCount: nextSnapshot.running.length,
            retryingCount: nextSnapshot.retrying.length,
            changed
          });

          publishRealtimeSnapshotDiff(
            input.realtime,
            previousSnapshot,
            nextSnapshot,
            input.logger
          );
          return nextSnapshot;
        } catch (error) {
          input.logger.error("Orchestrator poll cycle failed", {
            error
          });
          throw error;
        } finally {
          inFlightPollCycle = null;
          if (manualRefreshQueued) {
            scheduleQueuedManualRefreshDrain();
          }
        }
      })();

      return await inFlightPollCycle;
    }
  };

  return port;
}

type SymphonyRuntimeDriver = {
  snapshot(): SymphonyOrchestratorSnapshot;
  runPollCycle(): Promise<SymphonyOrchestratorSnapshot>;
  dispatchIssue(
    issue: SymphonyTrackerIssue,
    attempt: number,
    preferredWorkerHost?: string | null,
    runModeOverride?: SymphonyRunMode
  ): Promise<void>;
};
