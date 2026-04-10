import type {
  SymphonyDispatchBootstrapRouter,
  SymphonyRunLifecycleRouter,
  SymphonyRunStartActivationRouter
} from "@symphony/orchestrator";
import type {
  SymphonyReworkHandoff,
  SymphonyRunMode
} from "@symphony/runtime-contract";
import {
  createRuntimeCurrentFlowRouting
} from "./runtime-current-flow-routing.js";
import {
  createRuntimeDispatchBootstrapRouter
} from "./runtime-dispatch-bootstrap-routing.js";
import {
  createRuntimeDeliveryRouter,
  type SymphonyDeliveryStatus
} from "./runtime-delivery-routing.js";
import {
  createRuntimeMergeResultRouter
} from "./runtime-merge-result-routing.js";
import {
  createRuntimeReviewReworkRouter
} from "./runtime-review-rework-routing.js";
import {
  createRuntimeRunLifecycleRouter
} from "./runtime-run-lifecycle-routing.js";
import {
  createRuntimeRunStartActivationRouter
} from "./runtime-run-start-activation-routing.js";
import {
  createRuntimeRunShutdownRouter
} from "./runtime-run-shutdown-routing.js";
import {
  createRuntimeTrackerStateObservationRouter,
  type SymphonyTrackerStateDispatchRequest
} from "./runtime-tracker-state-observation-routing.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type {
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowMergeResultStatus,
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowPolicy,
  SymphonyCurrentFlowStateRequestKind,
  SymphonyCurrentFlowStateRequestTargetState
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerConfig
} from "@symphony/tracker";
import {
  normalizeIssueState
} from "@symphony/tracker";
import {
  createRuntimeStateRequestRouter
} from "./runtime-state-request-routing.js";

export type SymphonyRuntimeRouteLifecycleService = {
  dispatchBootstrapRouter: SymphonyDispatchBootstrapRouter;
  runStartActivationRouter: SymphonyRunStartActivationRouter;
  runLifecycleRouter: SymphonyRunLifecycleRouter;
  routeDeliveryReport(input: {
    issueIdentifier: string;
    runId: string;
    recordedAt: string;
    status: SymphonyDeliveryStatus;
  }): Promise<boolean>;
  routeMergeResult(input: {
    issueIdentifier: string;
    runId: string;
    recordedAt: string;
    status: SymphonyCurrentFlowMergeResultStatus;
  }): Promise<boolean>;
  routeRuntimeStateRequest(input: {
    issueIdentifier: string;
    runId: string;
    recordedAt: string;
    requestKind: SymphonyCurrentFlowStateRequestKind;
    targetState: SymphonyCurrentFlowStateRequestTargetState;
  }): Promise<boolean>;
  routeReviewReworkRequest(input: {
    issueIdentifier: string;
    recordedAt: string;
    handoff: SymphonyReworkHandoff;
    onDispatchRequested?(
      input: SymphonyTrackerStateDispatchRequest
    ): Promise<void> | void;
  }): Promise<boolean>;
  observeNonRunningTrackerStates(input: {
    claimedIssueIds: string[];
    recordedAt: string;
    onDispatchRequested?(
      input: SymphonyTrackerStateDispatchRequest
    ): Promise<void> | void;
  }): Promise<number>;
  observeTrackerStateByIdentifier(input: {
    issueIdentifier: string;
    recordedAt: string;
    onDispatchRequested?(
      input: SymphonyTrackerStateDispatchRequest
    ): Promise<void> | void;
  }): Promise<boolean>;
  routeShutdownPause(input: {
    issueIdentifier: string;
    runId: string;
    runMode: SymphonyRunMode;
    recordedAt: string;
    reason: string;
  }): Promise<boolean>;
  observeActiveIssueStateByIdentifier(input: {
    issueIdentifier: string;
    recordedAt: string;
  }): Promise<boolean>;
};

export async function createRuntimeRouteLifecycleService(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  trackerConfig: SymphonyTrackerConfig;
  repositoryKey: string;
  now?: () => Date;
}): Promise<SymphonyRuntimeRouteLifecycleService> {
  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: input.trackerConfig,
    now: input.now
  });
  const dispatchBootstrapRouter = await createRuntimeDispatchBootstrapRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    trackerConfig: input.trackerConfig,
    repositoryKey: input.repositoryKey,
    routing
  });
  const runStartActivationRouter =
    await createRuntimeRunStartActivationRouter({
      routeWorkflows: input.routeWorkflows,
      tracker: input.tracker,
      routing
    });
  const runLifecycleRouter = await createRuntimeRunLifecycleRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    routing
  });
  const deliveryRouter = await createRuntimeDeliveryRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    routing
  });
  const mergeResultRouter = await createRuntimeMergeResultRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    routing
  });
  const reviewReworkRouter = await createRuntimeReviewReworkRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    routing
  });
  const stateRequestRouter = await createRuntimeStateRequestRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    routing
  });
  const runShutdownRouter = await createRuntimeRunShutdownRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    routing
  });
  const trackerStateObservationRouter =
    await createRuntimeTrackerStateObservationRouter({
      routeWorkflows: input.routeWorkflows,
      tracker: input.tracker,
      trackerConfig: input.trackerConfig,
      repositoryKey: input.repositoryKey,
      routing
    });
  const observeNonRunningTrackerStates: SymphonyRuntimeRouteLifecycleService["observeNonRunningTrackerStates"] =
    async (observationInput) => {
      const claimedIssueIds = new Set(observationInput.claimedIssueIds);
      const issues = (
        await input.tracker.fetchIssuesByStates(
          input.trackerConfig,
          [...nonRunningTrackerObservationStates]
        )
      )
        .filter((issue) => !claimedIssueIds.has(issue.id))
        .sort((left, right) => left.identifier.localeCompare(right.identifier));
      let observedCount = 0;

      for (const issue of issues) {
        const hydration =
          await input.routeWorkflows.loadHydrationStateByIssueIdentifier<
            SymphonyCurrentFlowNode,
            SymphonyCurrentFlowData,
            SymphonyCurrentFlowPolicy
          >(issue.identifier);
        if (
          !shouldObserveNonRunningTrackerState({
            issue,
            hydration
          })
        ) {
          continue;
        }

        const observed = await trackerStateObservationRouter.observe({
          observationKind: "idle",
          issueIdentifier: issue.identifier,
          recordedAt: observationInput.recordedAt,
          onDispatchRequested: observationInput.onDispatchRequested
        });
        if (observed) {
          observedCount += 1;
        }
      }

      return observedCount;
    };
  const observeTrackerStateByIdentifier: SymphonyRuntimeRouteLifecycleService["observeTrackerStateByIdentifier"] =
    async (observationInput) => {
      const observed = await trackerStateObservationRouter.observe(
        {
          observationKind: "idle",
          ...observationInput
        }
      );
      return observed !== null;
    };
  const routeShutdownPause: SymphonyRuntimeRouteLifecycleService["routeShutdownPause"] =
    async (shutdownInput) => {
      const issue = await input.tracker.fetchIssueByIdentifier(
        input.trackerConfig,
        shutdownInput.issueIdentifier
      );
      if (!issue) {
        return false;
      }

      await runShutdownRouter.routeShutdown({
        issue,
        runId: shutdownInput.runId,
        runMode: shutdownInput.runMode,
        recordedAt: shutdownInput.recordedAt,
        reason: shutdownInput.reason
      });
      return true;
    };

  return {
    dispatchBootstrapRouter,
    runStartActivationRouter,
    runLifecycleRouter,
    async routeDeliveryReport(deliveryInput) {
      const issue = await input.tracker.fetchIssueByIdentifier(
        input.trackerConfig,
        deliveryInput.issueIdentifier
      );
      if (!issue) {
        return false;
      }

      await deliveryRouter.routeDelivery({
        issue,
        runId: deliveryInput.runId,
        recordedAt: deliveryInput.recordedAt,
        status: deliveryInput.status
      });
      return true;
    },
    async routeMergeResult(mergeResultInput) {
      const issue = await input.tracker.fetchIssueByIdentifier(
        input.trackerConfig,
        mergeResultInput.issueIdentifier
      );
      if (!issue) {
        return false;
      }

      await mergeResultRouter.routeMergeResult({
        issue,
        runId: mergeResultInput.runId,
        recordedAt: mergeResultInput.recordedAt,
        status: mergeResultInput.status
      });
      return true;
    },
    async routeRuntimeStateRequest(stateRequestInput) {
      const issue = await input.tracker.fetchIssueByIdentifier(
        input.trackerConfig,
        stateRequestInput.issueIdentifier
      );
      if (!issue) {
        return false;
      }

      await stateRequestRouter.routeStateRequest({
        issue,
        runId: stateRequestInput.runId,
        recordedAt: stateRequestInput.recordedAt,
        requestKind: stateRequestInput.requestKind,
        targetState: stateRequestInput.targetState
      });
      return true;
    },
    async routeReviewReworkRequest(reviewReworkInput) {
      const observed = await trackerStateObservationRouter.observe({
        observationKind: "idle",
        issueIdentifier: reviewReworkInput.issueIdentifier,
        recordedAt: reviewReworkInput.recordedAt,
        onDispatchRequested: reviewReworkInput.onDispatchRequested
      });
      if (!observed) {
        return false;
      }

      await reviewReworkRouter.routeReviewRework({
        issue: observed.issue,
        recordedAt: reviewReworkInput.recordedAt,
        handoff: reviewReworkInput.handoff,
        onDispatchRequested: reviewReworkInput.onDispatchRequested
      });
      return true;
    },
    observeNonRunningTrackerStates,
    observeTrackerStateByIdentifier,
    routeShutdownPause,
    async observeActiveIssueStateByIdentifier(observationInput) {
      const hydration =
        await input.routeWorkflows.loadHydrationStateByIssueIdentifier<
          SymphonyCurrentFlowNode,
          SymphonyCurrentFlowData,
          SymphonyCurrentFlowPolicy
        >(observationInput.issueIdentifier);
      if (!hydration) {
        return false;
      }

      const observed = await trackerStateObservationRouter.observe({
        observationKind: "active",
        issueIdentifier: observationInput.issueIdentifier,
        recordedAt: observationInput.recordedAt,
        runId: null,
        runMode: resolveActiveRunMode(hydration)
      });

      return observed !== null;
    }
  };
}

const nonRunningTrackerSeedStates = [
  "Todo",
  "Bootstrapping",
  "In Review",
  "Rework",
  "Approved"
] as const;

const nonRunningTrackerObservationStates = [
  ...nonRunningTrackerSeedStates,
  "Canceled",
  "Paused",
  "Blocked",
  "Failed"
] as const;

function shouldObserveNonRunningTrackerState(input: {
  issue: {
    state: string;
  };
  hydration: {
    snapshot: {
      projection: {
        data: SymphonyCurrentFlowData;
      };
    } | null;
  } | null;
}): boolean {
  const observedState = normalizeIssueState(input.issue.state);
  const hydratedState = input.hydration?.snapshot?.projection.data.trackerState;

  if (hydratedState && normalizeIssueState(hydratedState) === observedState) {
    return false;
  }

  if (input.hydration) {
    return true;
  }

  return nonRunningTrackerSeedStates.some(
    (state) => normalizeIssueState(state) === observedState
  );
}

function resolveActiveRunMode(
  hydration: {
    workflow: {
      workflowId: string;
    };
    snapshot: {
      projection: {
        data: SymphonyCurrentFlowData;
      };
    } | null;
  }
): SymphonyRunMode {
  const data = hydration.snapshot?.projection.data;
  if (data?.lastRunMode) {
    return data.lastRunMode;
  }
  if (data?.lastDispatchMode) {
    return data.lastDispatchMode;
  }

  throw new TypeError(
    `Route workflow ${hydration.workflow.workflowId} is missing an active run mode.`
  );
}
