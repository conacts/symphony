import type {
  SymphonyIssueDeliveryReportStore
} from "@symphony/db";
import type { SymphonyTracker } from "@symphony/tracker";
import {
  executeCancelTool,
  executeDeliveryReportTool,
  executeMergeResultTool,
  executeSpikeResultTool,
  isCompletedDeliveryTransitionState,
  type RuntimeMergeResult
} from "@symphony/runtime-tools";
import type { SymphonyRuntimeToolsPort } from "./runtime-app-types.js";
import type { SymphonyRuntimeRouteLifecycleService } from "./runtime-route-lifecycle-service.js";
import type { SymphonyTrackerStateDispatchRequest } from "./runtime-tracker-state-observation-routing.js";

type RuntimeToolsRouteLifecycle = Pick<
  SymphonyRuntimeRouteLifecycleService,
  "routeDeliveryReport" | "routeRuntimeStateRequest" | "routeMergeResult"
>;

export function createRuntimeToolsPort(input: {
  tracker: SymphonyTracker;
  deliveryReports: SymphonyIssueDeliveryReportStore;
  routeLifecycle: RuntimeToolsRouteLifecycle;
  blockedTargetState: string | null;
  pauseTargetState: string | null;
  canceledTargetState: string;
  onDispatchRequested?(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<void> | void;
}): SymphonyRuntimeToolsPort {
  return {
    async recordDeliveryReport(toolInput) {
      return await executeDeliveryReportTool(
        {
          tracker: input.tracker,
          deliveryReports: input.deliveryReports,
          issue: toolInput.issue,
          runId: toolInput.runId,
          turnId: toolInput.turnId,
          blockedTargetState: input.blockedTargetState,
          async transitionIssueState(request) {
            const status = resolveDeliveryStatus({
              targetState: request.targetState,
              blockedTargetState: input.blockedTargetState
            });
            const routed = await input.routeLifecycle.routeDeliveryReport({
              issueIdentifier: request.issueIdentifier,
              runId: toolInput.runId,
              recordedAt: request.recordedAt,
              status,
              onDispatchRequested: input.onDispatchRequested
            });

            return buildRoutedTransitionResult({
              routed,
              targetState: request.targetState,
              issueIdentifier: request.issueIdentifier,
              routeKind: "delivery"
            });
          }
        },
        toolInput.argumentsPayload
      );
    },
    async submitSpikeResult(toolInput) {
      return await executeSpikeResultTool(
        {
          tracker: input.tracker,
          issue: toolInput.issue,
          defaultTargetState: input.pauseTargetState,
          async transitionIssueState(request) {
            const routed = await input.routeLifecycle.routeRuntimeStateRequest({
              issueIdentifier: request.issueIdentifier,
              runId: toolInput.runId,
              recordedAt: request.recordedAt,
              requestKind: "spike_result",
              targetState: request.targetState
            });

            return buildRoutedTransitionResult({
              routed,
              targetState: request.targetState,
              issueIdentifier: request.issueIdentifier,
              routeKind: "spike"
            });
          }
        },
        toolInput.argumentsPayload
      );
    },
    async cancelIssue(toolInput) {
      return await executeCancelTool(
        {
          tracker: input.tracker,
          issue: toolInput.issue,
          defaultTargetState: input.canceledTargetState,
          async transitionIssueState(request) {
            const routed = await input.routeLifecycle.routeRuntimeStateRequest({
              issueIdentifier: request.issueIdentifier,
              runId: toolInput.runId,
              recordedAt: request.recordedAt,
              requestKind: "cancel",
              targetState: request.targetState
            });

            return buildRoutedTransitionResult({
              routed,
              targetState: request.targetState,
              issueIdentifier: request.issueIdentifier,
              routeKind: "cancel"
            });
          }
        },
        toolInput.argumentsPayload
      );
    },
    async submitMergeResult(toolInput) {
      let recordedMergeResult: RuntimeMergeResult | null = null;

      return await executeMergeResultTool(
        {
          tracker: input.tracker,
          issue: toolInput.issue,
          runId: toolInput.runId,
          turnId: toolInput.turnId,
          blockedTargetState: input.blockedTargetState,
          onMergeResultRecorded(result) {
            recordedMergeResult = result;
          },
          async transitionIssueState(request) {
            const mergeResult =
              recordedMergeResult ??
              (() => {
                throw new TypeError(
                  `Merge-result routing requires a structured merge result before transitioning ${request.issueIdentifier}.`
                );
              })();
            assertMergeResultTargetState({
              targetState: request.targetState,
              mergeResult,
              blockedTargetState: input.blockedTargetState
            });

            const routed = await input.routeLifecycle.routeMergeResult({
              issueIdentifier: request.issueIdentifier,
              runId: toolInput.runId,
              recordedAt: request.recordedAt,
              mergeResult
            });

            return buildRoutedTransitionResult({
              routed,
              targetState: request.targetState,
              issueIdentifier: request.issueIdentifier,
              routeKind: "merge-result"
            });
          }
        },
        toolInput.argumentsPayload
      );
    }
  };
}

function resolveDeliveryStatus(input: {
  targetState: string;
  blockedTargetState: string | null;
}): "completed" | "blocked" {
  if (isCompletedDeliveryTransitionState(input.targetState)) {
    return "completed";
  }

  if (
    input.blockedTargetState !== null &&
    input.targetState === input.blockedTargetState
  ) {
    return "blocked";
  }

  throw new TypeError(
    `Delivery routing does not support target state ${input.targetState}.`
  );
}

function assertMergeResultTargetState(input: {
  targetState: string;
  mergeResult: RuntimeMergeResult;
  blockedTargetState: string | null;
}): void {
  if (input.mergeResult.status === "merged" && input.targetState === "Done") {
    return;
  }

  if (
    input.mergeResult.status === "blocked" &&
    input.blockedTargetState !== null &&
    input.targetState === input.blockedTargetState
  ) {
    return;
  }

  throw new TypeError(
    `Merge-result routing does not support target state ${input.targetState} for ${input.mergeResult.status}.`
  );
}

function buildRoutedTransitionResult(input: {
  routed: boolean;
  targetState: string;
  issueIdentifier: string;
  routeKind: "delivery" | "spike" | "cancel" | "merge-result";
}) {
  return {
    attempted: true,
    targetState: input.targetState,
    success: input.routed,
    reason: input.routed
      ? null
      : `Route workflow-backed ${input.routeKind} routing could not load ${input.issueIdentifier}.`
  };
}
