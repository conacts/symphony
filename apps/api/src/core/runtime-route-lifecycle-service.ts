import type {
  SymphonyDispatchBootstrapRoutingInput,
  SymphonyRunLifecycleCompletionInput,
  SymphonyRunLifecycleObservationInput,
  SymphonyRunStartActivationInput,
  SymphonyWorkflowRoutingAdapter
} from "@symphony/orchestrator";
import type {
  SymphonyReworkHandoff,
  SymphonyRunMode
} from "@symphony/runtime-contract";
import type { RuntimeMergeResult } from "@symphony/runtime-tools";
import {
  createRuntimeWorkflowSessionLoader,
  type SymphonyLoadedRuntimeWorkflowHydration,
  type SymphonyRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import {
  selectRuntimeRouterPreset
} from "./runtime-workflow-presets.js";
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
  SymphonyTracker,
  SymphonyTrackerConfig
} from "@symphony/tracker";
import {
  normalizeIssueState
} from "@symphony/tracker";
import {
  createRuntimeStateRequestRouter
} from "./runtime-state-request-routing.js";
import type { SymphonyRuntimeWorkflowPresetSelection } from "./runtime-workflow-preset-selection.js";
import type {
  SymphonyRuntimeWorkflowLifecycleView
} from "./runtime-workflow-lifecycle-view.js";

export type SymphonyRuntimeRouteLifecycleService = {
  workflowRoutingAdapter: SymphonyWorkflowRoutingAdapter;
  loadWorkflowLifecycleView(input: {
    issueIdentifier: string;
    runId?: string | null;
  }): Promise<SymphonyRuntimeWorkflowLifecycleView | null>;
  routeDeliveryReport(input: {
    issueIdentifier: string;
    runId: string;
    recordedAt: string;
    status: SymphonyDeliveryStatus;
    onDispatchRequested?(
      input: SymphonyTrackerStateDispatchRequest
    ): Promise<void> | void;
  }): Promise<boolean>;
  routeMergeResult(input: {
    issueIdentifier: string;
    runId: string;
    recordedAt: string;
    mergeResult: RuntimeMergeResult;
  }): Promise<boolean>;
  routeRuntimeStateRequest(input: {
    issueIdentifier: string;
    runId: string;
    recordedAt: string;
    requestKind: string;
    targetState: string;
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
  }): Promise<SymphonyObservedTrackerState[]>;
  observeNonRunningTrackerStateByIdentifier(input: {
    issueIdentifier: string;
    recordedAt: string;
    onDispatchRequested?(
      input: SymphonyTrackerStateDispatchRequest
    ): Promise<void> | void;
  }): Promise<SymphonyTrackerStateObservation | null>;
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

export type SymphonyObservedTrackerState = {
  issueIdentifier: string;
  // This is the tracker state observed at ingress time, not a workflow projection.
  trackerState: string;
};

export type SymphonyTrackerStateObservation = SymphonyObservedTrackerState & {
  observed: boolean;
};

export async function createRuntimeRouteLifecycleService(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  trackerConfig: SymphonyTrackerConfig;
  repositoryKey: string;
  presetSelection: SymphonyRuntimeWorkflowPresetSelection;
  sessionLoader?: SymphonyRuntimeWorkflowSessionLoader;
  now?: () => Date;
}): Promise<SymphonyRuntimeRouteLifecycleService> {
  const routing = await selectRuntimeRouterPreset({
    trackerConfig: input.trackerConfig,
    presetId: input.presetSelection.presetId,
    now: input.now
  });
  const sessionLoader =
    input.sessionLoader ??
    (await createRuntimeWorkflowSessionLoader({
      routeWorkflows: input.routeWorkflows,
      trackerConfig: input.trackerConfig,
      now: input.now
    }));
  const dispatchBootstrapRouter = await createRuntimeDispatchBootstrapRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    trackerConfig: input.trackerConfig,
    repositoryKey: input.repositoryKey,
    routing,
    sessionLoader
  });
  const runStartActivationRouter =
    await createRuntimeRunStartActivationRouter({
      routeWorkflows: input.routeWorkflows,
      tracker: input.tracker,
      sessionLoader
    });
  const runLifecycleRouter = await createRuntimeRunLifecycleRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    sessionLoader
  });
  const workflowRoutingAdapter: SymphonyWorkflowRoutingAdapter = {
    async routeDispatchBootstrap(
      routeInput: SymphonyDispatchBootstrapRoutingInput
    ) {
      return await dispatchBootstrapRouter.route(routeInput);
    },
    async activateRunStart(activationInput: SymphonyRunStartActivationInput) {
      return await runStartActivationRouter.activate(activationInput);
    },
    async observeRunningIssueState(
      observationInput: SymphonyRunLifecycleObservationInput
    ) {
      return await runLifecycleRouter.observeIssueState(observationInput);
    },
    async routeRunCompletion(
      completionInput: SymphonyRunLifecycleCompletionInput
    ) {
      return await runLifecycleRouter.routeCompletion(completionInput);
    }
  };
  const deliveryRouter = await createRuntimeDeliveryRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    sessionLoader
  });
  const mergeResultRouter = await createRuntimeMergeResultRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    sessionLoader
  });
  const reviewReworkRouter = await createRuntimeReviewReworkRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    sessionLoader
  });
  const stateRequestRouter = await createRuntimeStateRequestRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    sessionLoader
  });
  const runShutdownRouter = await createRuntimeRunShutdownRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    sessionLoader
  });
  const trackerStateObservationRouter =
    await createRuntimeTrackerStateObservationRouter({
      routeWorkflows: input.routeWorkflows,
      tracker: input.tracker,
      trackerConfig: input.trackerConfig,
      repositoryKey: input.repositoryKey,
      routing,
      sessionLoader
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
      const observedIssues: SymphonyObservedTrackerState[] = [];

      for (const issue of issues) {
        const hydration = await sessionLoader.loadHydrationByIssueIdentifier({
          issueIdentifier: issue.identifier
        });
        if (
          !shouldIngressObservedNonRunningTrackerState({
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
          observedIssues.push({
            issueIdentifier: observed.issue.identifier,
            trackerState: observed.issue.state
          });
        }
      }

      return observedIssues;
    };
  const observeNonRunningTrackerStateByIdentifier: SymphonyRuntimeRouteLifecycleService["observeNonRunningTrackerStateByIdentifier"] =
    async (observationInput) => {
      const issue = await input.tracker.fetchIssueByIdentifier(
        input.trackerConfig,
        observationInput.issueIdentifier
      );
      if (!issue) {
        return null;
      }

      const hydration = await sessionLoader.loadHydrationByIssueIdentifier({
        issueIdentifier: issue.identifier
      });
      if (
        !shouldIngressObservedNonRunningTrackerState({
          issue,
          hydration
        })
      ) {
        return {
          issueIdentifier: issue.identifier,
          trackerState: issue.state,
          observed: false
        };
      }

      const observed = await trackerStateObservationRouter.observe({
        observationKind: "idle",
        ...observationInput
      });
      if (!observed) {
        return null;
      }

      return {
        issueIdentifier: observed.issue.identifier,
        trackerState: observed.issue.state,
        observed: true
      };
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
  const loadWorkflowLifecycleView: SymphonyRuntimeRouteLifecycleService["loadWorkflowLifecycleView"] =
    async ({ issueIdentifier, runId = null }) => {
      const projection = await loadReadableWorkflowProjectionByIssueIdentifier({
        sessionLoader,
        issueIdentifier
      });
      if (!projection) {
        return null;
      }

      return readWorkflowLifecycleViewFromProjection({
        projection,
        issueIdentifier,
        runId
      });
    };

  return {
    workflowRoutingAdapter,
    loadWorkflowLifecycleView,
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
        status: deliveryInput.status,
        onDispatchRequested: deliveryInput.onDispatchRequested
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
        mergeResult: mergeResultInput.mergeResult
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
    observeNonRunningTrackerStateByIdentifier,
    routeShutdownPause,
    async observeActiveIssueStateByIdentifier(observationInput) {
      const issue = await input.tracker.fetchIssueByIdentifier(
        input.trackerConfig,
        observationInput.issueIdentifier
      );
      if (!issue) {
        return false;
      }

      const hydration = await sessionLoader.loadHydrationByIssueIdentifier({
        issueIdentifier: observationInput.issueIdentifier
      });
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

function shouldIngressObservedNonRunningTrackerState(input: {
  issue: {
    state: string;
  };
  hydration: SymphonyLoadedRuntimeWorkflowHydration | null;
}): boolean {
  const observedTrackerState = normalizeIssueState(input.issue.state);
  const hydration = input.hydration;
  const snapshot = hydration?.hydrationState.snapshot;
  let projectedWorkflowTrackerState: string | null = null;
  if (hydration && snapshot) {
    projectedWorkflowTrackerState =
      hydration.routing.module.runtimeAdapter.readTrackerStateFromProjection({
        workflowId: hydration.hydrationState.workflow.workflowId,
        data: snapshot.projection.data
      });
  }

  if (
    projectedWorkflowTrackerState &&
    normalizeIssueState(projectedWorkflowTrackerState) === observedTrackerState
  ) {
    if (!hydration || !snapshot) {
      return false;
    }

    const currentNode = snapshot.projection.currentNode;
    if (!currentNode) {
      throw new TypeError(
        `Route workflow ${hydration.hydrationState.workflow.workflowId} is missing a current node during idle tracker observation.`
      );
    }

    return hydration.routing.module.runtimeAdapter.shouldObserveUnchangedIdleTrackerState(
      {
        workflowId: hydration.hydrationState.workflow.workflowId,
        currentNode,
        data: snapshot.projection.data,
        // This is the externally observed tracker state being compared against
        // unchanged workflow state to decide whether ingress should still emit.
        trackerState: input.issue.state
      }
    );
  }

  if (input.hydration) {
    return true;
  }

  return nonRunningTrackerSeedStates.some(
    (state) => normalizeIssueState(state) === observedTrackerState
  );
}

function resolveActiveRunMode(
  hydration: SymphonyLoadedRuntimeWorkflowHydration
): SymphonyRunMode {
  const snapshot = hydration.hydrationState.snapshot;
  if (!snapshot) {
    throw new TypeError(
      `Route workflow ${hydration.hydrationState.workflow.workflowId} is missing an active run mode.`
    );
  }

  return hydration.routing.module.runtimeAdapter.readActiveRunModeFromProjection({
    workflowId: hydration.hydrationState.workflow.workflowId,
    data: snapshot.projection.data
  });
}

function readWorkflowLifecycleViewFromProjection(input: {
  projection: {
    loaded: SymphonyLoadedRuntimeWorkflowHydration;
    workflowId: string;
    data: unknown;
  };
  issueIdentifier: string;
  runId: string | null;
}): SymphonyRuntimeWorkflowLifecycleView {
  const { projection } = input;
  const trackerState =
    projection.loaded.routing.module.runtimeAdapter.readTrackerStateFromProjection({
      workflowId: projection.workflowId,
      data: projection.data
    });
  if (!trackerState) {
    throw new TypeError(
      `Route workflow ${projection.workflowId} cannot project the current tracker state for ${input.issueIdentifier}.`
    );
  }

  return {
    workflowId: projection.workflowId,
    trackerState,
    latestReworkHandoff:
      projection.loaded.routing.module.runtimeAdapter.readLatestReworkHandoffFromProjection(
        {
          workflowId: projection.workflowId,
          data: projection.data
        }
      ),
    latestMergeResult:
      input.runId === null
        ? null
        : projection.loaded.routing.module.runtimeAdapter.readLatestMergeResultFromProjection(
            {
              workflowId: projection.workflowId,
              data: projection.data,
              runId: input.runId
            }
          )
  };
}

async function loadReadableWorkflowProjectionByIssueIdentifier(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  issueIdentifier: string;
}): Promise<{
  loaded: SymphonyLoadedRuntimeWorkflowHydration;
  workflowId: string;
  data: unknown;
} | null> {
  const loaded = await input.sessionLoader.loadHydrationByIssueIdentifier({
    issueIdentifier: input.issueIdentifier
  });
  if (!loaded) {
    return null;
  }

  const snapshot = loaded.hydrationState.snapshot;
  if (!snapshot) {
    throw new TypeError(
      `Route workflow ${loaded.hydrationState.workflow.workflowId} is missing a readable projection snapshot for ${input.issueIdentifier}.`
    );
  }

  return {
    loaded,
    workflowId: loaded.hydrationState.workflow.workflowId,
    data: snapshot.projection.data
  };
}
