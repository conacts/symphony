import type { SymphonyLogger } from "@symphony/logger";
import type { SymphonyRuntimeLogStore } from "@symphony/db";
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
  runtime: Pick<SymphonyRuntimeDriver, "snapshot" | "runPollCycle">;
  logger: SymphonyLogger;
  runtimeLogs: SymphonyRuntimeLogStore;
  realtime: SymphonyRealtimeHub;
}): SymphonyRuntimeOrchestratorPort {
  let inFlightPollCycle: Promise<SymphonyOrchestratorSnapshot> | null = null;
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

    async runPollCycle() {
      if (inFlightPollCycle) {
        return await inFlightPollCycle;
      }

      const previousSnapshot = input.runtime.snapshot();
      inFlightPollCycle = (async () => {
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
};
