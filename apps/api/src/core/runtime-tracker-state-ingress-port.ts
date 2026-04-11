import type { SymphonyRuntimeLogStore } from "@symphony/db";
import type {
  SymphonyObservedTrackerState,
  SymphonyRuntimeRouteLifecycleService
} from "./runtime-route-lifecycle-service.js";
import type {
  SymphonyTrackerStateDispatchRequest
} from "./runtime-tracker-state-observation-routing.js";

export type SymphonyTrackerStateIngressPort = {
  observeNonRunning(input: {
    claimedIssueIds: string[];
    recordedAt: string;
    onDispatchRequested?(
      input: SymphonyTrackerStateDispatchRequest
    ): Promise<void> | void;
  }): Promise<SymphonyObservedTrackerState[]>;
  observeByIdentifier(input: {
    issueIdentifier: string;
    recordedAt: string;
    onDispatchRequested?(
      input: SymphonyTrackerStateDispatchRequest
    ): Promise<void> | void;
  }): Promise<SymphonyObservedTrackerState | null>;
};

export function createRuntimeTrackerStateIngressPort(input: {
  routeLifecycle: Pick<
    SymphonyRuntimeRouteLifecycleService,
    "observeNonRunningTrackerStates" | "observeTrackerStateByIdentifier"
  >;
  runtimeLogStore: SymphonyRuntimeLogStore;
}): SymphonyTrackerStateIngressPort {
  return {
    async observeNonRunning(observationInput) {
      try {
        const observedIssues =
          await input.routeLifecycle.observeNonRunningTrackerStates(observationInput);

        for (const observedIssue of observedIssues) {
          await input.runtimeLogStore.record({
            level: "info",
            source: "tracker_state_ingress",
            eventType: "tracker_state_ingress_observed",
            message:
              "Observed non-running tracker state through workflow history ingress.",
            issueIdentifier: observedIssue.issueIdentifier,
            payload: {
              scope: "non_running_batch",
              trackerState: observedIssue.trackerState,
              claimedIssueCount: observationInput.claimedIssueIds.length
            },
            recordedAt: observationInput.recordedAt
          });
        }

        if (observedIssues.length > 0) {
          await input.runtimeLogStore.record({
            level: "info",
            source: "tracker_state_ingress",
            eventType: "tracker_state_ingress_batch_completed",
            message:
              "Completed non-running tracker state ingress through workflow history.",
            payload: {
              observedCount: observedIssues.length,
              claimedIssueCount: observationInput.claimedIssueIds.length,
              observedIssues: observedIssues.map((observedIssue) => ({
                issueIdentifier: observedIssue.issueIdentifier,
                trackerState: observedIssue.trackerState
              }))
            },
            recordedAt: observationInput.recordedAt
          });
        }

        return observedIssues;
      } catch (error) {
        await input.runtimeLogStore.record({
          level: "error",
          source: "tracker_state_ingress",
          eventType: "tracker_state_ingress_failed",
          message:
            "Failed to observe non-running tracker states through workflow history ingress.",
          payload: {
            scope: "non_running_batch",
            claimedIssueCount: observationInput.claimedIssueIds.length,
            error: stringifyError(error)
          },
          recordedAt: observationInput.recordedAt
        });
        throw error;
      }
    },

    async observeByIdentifier(observationInput) {
      try {
        const observedIssue =
          await input.routeLifecycle.observeTrackerStateByIdentifier(observationInput);

        await input.runtimeLogStore.record({
          level: "info",
          source: "tracker_state_ingress",
          eventType: observedIssue
            ? "tracker_state_ingress_observed"
            : "tracker_state_ingress_skipped",
          message: observedIssue
            ? "Observed tracker state through workflow history ingress."
            : "Skipped tracker state ingress because no workflow-backed observation was applied.",
          issueIdentifier: observationInput.issueIdentifier,
          payload: {
            scope: "issue_identifier",
            trackerState: observedIssue?.trackerState ?? null
          },
          recordedAt: observationInput.recordedAt
        });

        return observedIssue;
      } catch (error) {
        await input.runtimeLogStore.record({
          level: "error",
          source: "tracker_state_ingress",
          eventType: "tracker_state_ingress_failed",
          message:
            "Failed to observe tracker state through workflow history ingress.",
          issueIdentifier: observationInput.issueIdentifier,
          payload: {
            scope: "issue_identifier",
            error: stringifyError(error)
          },
          recordedAt: observationInput.recordedAt
        });
        throw error;
      }
    }
  };
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
