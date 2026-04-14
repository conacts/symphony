import type { RouteWorkflowStore } from "@symphony/db";
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
import type { RuntimeMergeResult } from "./runtime-result-types.js";
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
import type {
  RouteWorkflowBindingScope,
  SymphonyRouteWorkflowPort
} from "./runtime-route-workflows.js";
import type {
  SymphonyTracker,
  SymphonyTrackerConfig,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import {
  normalizeIssueState
} from "@symphony/tracker";
import {
  createRuntimeStateRequestRouter
} from "./runtime-state-request-routing.js";
import {
  buildNonRunningTrackerIngressPolicy
} from "./runtime-route-lifecycle-policy.js";
import type { SymphonyRuntimeWorkflowPresetSelection } from "./runtime-workflow-preset-selection.js";
import type {
  SymphonyRuntimeWorkflowLifecycleView
} from "./runtime-workflow-lifecycle-view.js";
import type {
  SymphonyCapabilityDispatchAuthorityService
} from "./symphony-capability-dispatch-authority.js";
import type {
  SymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";
import {
  createSymphonyCapabilityRunCompletionService
} from "./symphony-capability-run-completion.js";

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
  }): Promise<SymphonyTrackerStateIngressRecord[]>;
  observeNonRunningTrackerStateByIdentifier(input: {
    issueIdentifier: string;
    recordedAt: string;
    onDispatchRequested?(
      input: SymphonyTrackerStateDispatchRequest
    ): Promise<void> | void;
  }): Promise<SymphonyTrackerStateIngressObservation | null>;
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

export type SymphonyTrackerStateIngressRecord = {
  issueIdentifier: string;
  observedTrackerState: string;
  workflowTrackerState: string;
};

export type SymphonyTrackerStateIngressObservation =
  | (SymphonyTrackerStateIngressRecord & {
      observed: true;
      disposition: "observed";
    })
  | (SymphonyTrackerStateIngressRecord & {
      observed: false;
      disposition: "skipped";
    })
  | {
      issueIdentifier: string;
      observedTrackerState: string;
      workflowTrackerState: null;
      observed: false;
      disposition: "ignored";
    };

type NonRunningTrackerIngressDisposition =
  | {
      disposition: "observe";
    }
  | {
      disposition: "skip";
      workflowTrackerState: string;
    }
  | {
      disposition: "ignore";
    };

export async function createRuntimeRouteLifecycleService(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  trackerConfig: SymphonyTrackerConfig;
  repositoryKey: string;
  workflowBindingScope?: RouteWorkflowBindingScope | null;
  resolveIssueRepositoryKey?(issue: SymphonyTrackerIssue): string;
  ensureIssueIdentity?(
    issue: SymphonyTrackerIssue
  ): Promise<void> | void;
  presetSelection: SymphonyRuntimeWorkflowPresetSelection;
  sessionLoader?: SymphonyRuntimeWorkflowSessionLoader;
  routeWorkflowStore?: RouteWorkflowStore;
  capabilityPlanning?: SymphonyCapabilityPlanningService;
  capabilityDispatchAuthority: SymphonyCapabilityDispatchAuthorityService;
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
      bindingScope: input.workflowBindingScope ?? null,
      now: input.now
    }));
  const dispatchBootstrapRouter = await createRuntimeDispatchBootstrapRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    trackerConfig: input.trackerConfig,
    repositoryKey: input.repositoryKey,
    bindingScope: input.workflowBindingScope ?? null,
    resolveIssueRepositoryKey: input.resolveIssueRepositoryKey,
    ensureIssueIdentity: input.ensureIssueIdentity,
    routing,
    sessionLoader,
    capabilityDispatchAuthority: input.capabilityDispatchAuthority
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
      bindingScope: input.workflowBindingScope ?? null,
      resolveIssueRepositoryKey: input.resolveIssueRepositoryKey,
      ensureIssueIdentity: input.ensureIssueIdentity,
      routing,
      sessionLoader
    });
  const capabilityRunCompletion =
    input.routeWorkflowStore && input.capabilityPlanning
      ? createSymphonyCapabilityRunCompletionService({
          routeWorkflowStore: input.routeWorkflowStore,
          routeWorkflows: input.routeWorkflows,
          sessionLoader,
          capabilityPlanning: input.capabilityPlanning
        })
      : null;
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
      if (capabilityRunCompletion) {
        const capabilityResult =
          await capabilityRunCompletion.handleRunCompletion({
            issueIdentifier: completionInput.issue.identifier,
            runMode: completionInput.runMode,
            completion: completionInput.completion,
            recordedAt: completionInput.recordedAt
          });

        switch (capabilityResult.kind) {
          case "continued":
            return {
              issue: completionInput.issue,
              continueWithRunMode: capabilityResult.continueWithRunMode
            };
          case "ready_for_completion": {
            if (!completionInput.runId) {
              throw new TypeError(
                `Capability-managed completion for ${completionInput.issue.identifier} requires a run id to route delivery.`
              );
            }

            let continueWithRunMode: SymphonyRunMode | null = null;
            const routedDelivery = await deliveryRouter.routeDelivery({
              projectedIssue: completionInput.issue,
              runId: completionInput.runId,
              recordedAt: completionInput.recordedAt,
              status: "completed",
              onDispatchRequested: async (dispatchRequest) => {
                continueWithRunMode = dispatchRequest.runMode;
              }
            });

            return {
              issue: routedDelivery.projectedIssue,
              continueWithRunMode
            };
          }
          case "awaiting_input":
          case "blocked":
            return {
              issue: completionInput.issue
            };
          case "failure_recorded":
          case "not_handled":
            break;
        }
      }

      return await runLifecycleRouter.routeCompletion(completionInput);
    }
  };
  const nonRunningTrackerIngressPolicy = buildNonRunningTrackerIngressPolicy({
    presetId: routing.module.presetId,
    trackerConfig: input.trackerConfig,
    presetRequiredSeedStates: routing.module.requiredNonRunningTrackerSeedStates
  });
  const observeNonRunningTrackerStates: SymphonyRuntimeRouteLifecycleService["observeNonRunningTrackerStates"] =
    async (observationInput) => {
      const claimedIssueIds = new Set(observationInput.claimedIssueIds);
      const issues = (
        await input.tracker.fetchIssuesByStates(
          input.trackerConfig,
          nonRunningTrackerIngressPolicy.observableStates
        )
      )
        .filter((issue) => !claimedIssueIds.has(issue.id))
        .sort((left, right) => left.identifier.localeCompare(right.identifier));
      const observedIssues: SymphonyTrackerStateIngressRecord[] = [];

      for (const issue of issues) {
        const observedTrackerState = issue.state;
        const hydration = await sessionLoader.loadHydrationByIssueIdentifier({
          issueIdentifier: issue.identifier
        });
        const disposition = classifyNonRunningTrackerIngressDisposition({
          issue,
          hydration,
          seedStates: nonRunningTrackerIngressPolicy.seedStates
        });
        if (disposition.disposition !== "observe") {
          continue;
        }

        const observed = await trackerStateObservationRouter.observe({
          observationKind: "idle",
          issueIdentifier: issue.identifier,
          recordedAt: observationInput.recordedAt,
          onDispatchRequested: createDispatchRequestHandler({
            externalCallback: observationInput.onDispatchRequested,
            missingCallbackMessage:
              "Idle tracker state observation emitted run.dispatch without a dispatch callback."
          })
        });
        if (observed) {
          const workflowLifecycle = await loadRequiredWorkflowLifecycleView({
            issueIdentifier: observed.issue.identifier,
            failureContext:
              "after non-running tracker state ingress recorded an observed transition"
          });
          observedIssues.push({
            issueIdentifier: observed.issue.identifier,
            observedTrackerState,
            workflowTrackerState: workflowLifecycle.trackerState
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
      const disposition = classifyNonRunningTrackerIngressDisposition({
        issue,
        hydration,
        seedStates: nonRunningTrackerIngressPolicy.seedStates
      });

      if (disposition.disposition === "skip") {
        return {
          issueIdentifier: issue.identifier,
          observedTrackerState: issue.state,
          workflowTrackerState: disposition.workflowTrackerState,
          observed: false,
          disposition: "skipped"
        };
      }

      if (disposition.disposition === "ignore") {
        return {
          issueIdentifier: issue.identifier,
          observedTrackerState: issue.state,
          workflowTrackerState: null,
          observed: false,
          disposition: "ignored"
        };
      }

      const observedTrackerState = issue.state;
      const observed = await trackerStateObservationRouter.observe({
        observationKind: "idle",
        ...observationInput,
        onDispatchRequested: createDispatchRequestHandler({
          externalCallback: observationInput.onDispatchRequested,
          missingCallbackMessage:
            "Idle tracker state observation emitted run.dispatch without a dispatch callback."
        })
      });
      if (!observed) {
        return null;
      }

      const workflowLifecycle = await loadRequiredWorkflowLifecycleView({
        issueIdentifier: observed.issue.identifier,
        failureContext:
          "after non-running tracker state ingress recorded an observed transition"
      });

      return {
        issueIdentifier: observed.issue.identifier,
        observedTrackerState,
        workflowTrackerState: workflowLifecycle.trackerState,
        observed: true,
        disposition: "observed"
      };
    };
  const routeShutdownPause: SymphonyRuntimeRouteLifecycleService["routeShutdownPause"] =
    async (shutdownInput) => {
      const projectedIssue = await loadWorkflowProjectedLifecycleIssue({
        sessionLoader,
        issueIdentifier: shutdownInput.issueIdentifier,
        failureContext: "during shutdown routing"
      });
      if (!projectedIssue) {
        return false;
      }

      await runShutdownRouter.routeShutdown({
        projectedIssue,
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
  const loadRequiredWorkflowLifecycleView = async (input: {
    issueIdentifier: string;
    failureContext: string;
  }): Promise<SymphonyRuntimeWorkflowLifecycleView> => {
    const workflowLifecycle = await loadWorkflowLifecycleView({
      issueIdentifier: input.issueIdentifier
    });
    if (!workflowLifecycle) {
      throw new TypeError(
        `Workflow lifecycle view is missing for ${input.issueIdentifier} ${input.failureContext}.`
      );
    }
    return workflowLifecycle;
  };
  const createDispatchRequestHandler = (handlerInput: {
    externalCallback?(
      input: SymphonyTrackerStateDispatchRequest
    ): Promise<void> | void;
    missingCallbackMessage: string;
  }) => {
    return async (dispatchRequest: SymphonyTrackerStateDispatchRequest) => {
      const handled =
        await input.capabilityDispatchAuthority.handleDispatchRequest(
          dispatchRequest
        );
      if (handled === "handled_in_process") {
        return;
      }

      if (!handlerInput.externalCallback) {
        throw new TypeError(handlerInput.missingCallbackMessage);
      }

      await handlerInput.externalCallback(dispatchRequest);
    };
  };

  return {
    workflowRoutingAdapter,
    loadWorkflowLifecycleView,
    async routeDeliveryReport(deliveryInput) {
      const projectedIssue = await loadWorkflowProjectedLifecycleIssue({
        sessionLoader,
        issueIdentifier: deliveryInput.issueIdentifier,
        failureContext: "during delivery routing"
      });
      if (!projectedIssue) {
        return false;
      }

      await deliveryRouter.routeDelivery({
        projectedIssue,
        runId: deliveryInput.runId,
        recordedAt: deliveryInput.recordedAt,
        status: deliveryInput.status,
        onDispatchRequested: createDispatchRequestHandler({
          externalCallback: deliveryInput.onDispatchRequested,
          missingCallbackMessage:
            "Delivery routing emitted run.dispatch without a dispatch callback."
        })
      });
      return true;
    },
    async routeMergeResult(mergeResultInput) {
      assertLegacyFollowUpRoutingUnsupported({
        presetId: routing.presetId,
        routeKind: "merge-result"
      });
      const projectedIssue = await loadWorkflowProjectedLifecycleIssue({
        sessionLoader,
        issueIdentifier: mergeResultInput.issueIdentifier,
        failureContext: "during merge-result routing"
      });
      if (!projectedIssue) {
        return false;
      }

      await mergeResultRouter.routeMergeResult({
        projectedIssue,
        runId: mergeResultInput.runId,
        recordedAt: mergeResultInput.recordedAt,
        mergeResult: mergeResultInput.mergeResult
      });
      return true;
    },
    async routeRuntimeStateRequest(stateRequestInput) {
      const projectedIssue = await loadWorkflowProjectedLifecycleIssue({
        sessionLoader,
        issueIdentifier: stateRequestInput.issueIdentifier,
        failureContext: "during runtime state-request routing"
      });
      if (!projectedIssue) {
        return false;
      }

      await stateRequestRouter.routeStateRequest({
        projectedIssue,
        runId: stateRequestInput.runId,
        recordedAt: stateRequestInput.recordedAt,
        requestKind: stateRequestInput.requestKind,
        targetState: stateRequestInput.targetState
      });
      return true;
    },
    async routeReviewReworkRequest(reviewReworkInput) {
      assertLegacyFollowUpRoutingUnsupported({
        presetId: routing.presetId,
        routeKind: "review-rework"
      });
      const observed = await trackerStateObservationRouter.observe({
        observationKind: "idle",
        issueIdentifier: reviewReworkInput.issueIdentifier,
        recordedAt: reviewReworkInput.recordedAt,
        onDispatchRequested: createDispatchRequestHandler({
          externalCallback: reviewReworkInput.onDispatchRequested,
          missingCallbackMessage:
            "Idle tracker state observation emitted run.dispatch without a dispatch callback."
        })
      });
      if (!observed) {
        return false;
      }

      await reviewReworkRouter.routeReviewRework({
        observedTrackerIssue: observed.issue,
        recordedAt: reviewReworkInput.recordedAt,
        handoff: reviewReworkInput.handoff,
        onDispatchRequested: createDispatchRequestHandler({
          externalCallback: reviewReworkInput.onDispatchRequested,
          missingCallbackMessage:
            "Review rework routing emitted run.dispatch without a dispatch callback."
        })
      });
      return true;
    },
    observeNonRunningTrackerStates,
    observeNonRunningTrackerStateByIdentifier,
    routeShutdownPause,
    async observeActiveIssueStateByIdentifier(observationInput) {
      const observedTrackerIssue = await input.tracker.fetchIssueByIdentifier(
        input.trackerConfig,
        observationInput.issueIdentifier
      );
      if (!observedTrackerIssue) {
        return false;
      }

      const activeRunMode = await loadActiveObservationRunMode({
        sessionLoader,
        issueIdentifier: observationInput.issueIdentifier
      });
      if (!activeRunMode) {
        return false;
      }

      const observed = await trackerStateObservationRouter.observe({
        observationKind: "active",
        issueIdentifier: observationInput.issueIdentifier,
        observedTrackerIssue,
        recordedAt: observationInput.recordedAt,
        runId: null,
        runMode: activeRunMode
      });

      if (!observed) {
        return false;
      }

      await loadRequiredWorkflowLifecycleView({
        issueIdentifier: observed.issue.identifier,
        failureContext:
          "after active tracker state observation recorded an observed transition"
      });

      return true;
    }
  };
}

function classifyNonRunningTrackerIngressDisposition(input: {
  issue: {
    state: string;
  };
  hydration: SymphonyLoadedRuntimeWorkflowHydration | null;
  seedStates: readonly string[];
}): NonRunningTrackerIngressDisposition {
  const observedTrackerState = normalizeIssueState(input.issue.state);
  const hydration = input.hydration;
  const snapshot = hydration?.hydrationState.snapshot;
  if (hydration && snapshot) {
    const projectedWorkflowTrackerState =
      hydration.routing.module.runtimeAdapter.readTrackerStateFromProjection({
        workflowId: hydration.hydrationState.workflow.workflowId,
        data: snapshot.projection.data
      });
    if (!projectedWorkflowTrackerState) {
      throw new TypeError(
        `Route workflow ${hydration.hydrationState.workflow.workflowId} cannot project the current tracker state during idle tracker observation.`
      );
    }

    if (
      normalizeIssueState(projectedWorkflowTrackerState) === observedTrackerState
    ) {
      const currentNode = snapshot.projection.currentNode;
      if (!currentNode) {
        throw new TypeError(
          `Route workflow ${hydration.hydrationState.workflow.workflowId} is missing a current node during idle tracker observation.`
        );
      }

      if (
        hydration.routing.module.runtimeAdapter.shouldObserveUnchangedIdleTrackerState(
          {
            workflowId: hydration.hydrationState.workflow.workflowId,
            currentNode,
            data: snapshot.projection.data,
            // This is the externally observed tracker state being compared
            // against unchanged workflow state to decide whether ingress
            // should still emit.
            trackerState: input.issue.state
          }
        )
      ) {
        return {
          disposition: "observe"
        };
      }

      return {
        disposition: "skip",
        workflowTrackerState: projectedWorkflowTrackerState
      };
    }
  }

  if (input.hydration) {
    return {
      disposition: "observe"
    };
  }

  if (
    input.seedStates.some(
      (state) => normalizeIssueState(state) === observedTrackerState
    )
  ) {
    return {
      disposition: "observe"
    };
  }

  return {
    disposition: "ignore"
  };
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

function assertLegacyFollowUpRoutingUnsupported(input: {
  presetId: string;
  routeKind: "merge-result" | "review-rework";
}): void {
  if (input.presetId !== "intelligent-flow") {
    return;
  }

  throw new TypeError(
    `Live intelligent-flow does not support ${input.routeKind} routing. Delivery completion is terminal and follow-up work must be selected through capability planning instead.`
  );
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

async function loadActiveObservationRunMode(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  issueIdentifier: string;
}): Promise<SymphonyRunMode | null> {
  const hydration = await input.sessionLoader.loadHydrationByIssueIdentifier({
    issueIdentifier: input.issueIdentifier
  });
  if (!hydration) {
    return null;
  }

  return resolveActiveRunMode(hydration);
}

async function loadWorkflowProjectedLifecycleIssue(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  issueIdentifier: string;
  failureContext: string;
}): Promise<SymphonyTrackerIssue | null> {
  const loaded = await input.sessionLoader.loadHydrationByIssueIdentifier({
    issueIdentifier: input.issueIdentifier
  });
  if (!loaded) {
    return null;
  }

  const snapshot = loaded.hydrationState.snapshot;
  if (!snapshot) {
    throw new TypeError(
      `Route workflow ${loaded.hydrationState.workflow.workflowId} is missing a readable projection snapshot for ${input.issueIdentifier} ${input.failureContext}.`
    );
  }

  const trackerState =
    loaded.routing.module.runtimeAdapter.readTrackerStateFromProjection({
      workflowId: loaded.hydrationState.workflow.workflowId,
      data: snapshot.projection.data
    });
  if (!trackerState) {
    throw new TypeError(
      `Route workflow ${loaded.hydrationState.workflow.workflowId} cannot project the current tracker state for ${input.issueIdentifier} ${input.failureContext}.`
    );
  }

  return createWorkflowProjectedLifecycleIssue({
    trackerIssueId: loaded.hydrationState.workflow.trackerIssueId,
    issueIdentifier: input.issueIdentifier,
    trackerState
  });
}

function createWorkflowProjectedLifecycleIssue(input: {
  trackerIssueId: string;
  issueIdentifier: string;
  trackerState: string;
}): SymphonyTrackerIssue {
  return {
    id: input.trackerIssueId,
    identifier: input.issueIdentifier,
    title: input.issueIdentifier,
    description: null,
    priority: null,
    state: input.trackerState,
    branchName: null,
    url: null,
    projectId: null,
    projectName: null,
    teamKey: null,
    assigneeId: null,
    blockedBy: [],
    labels: [],
    assignedToWorker: false,
    createdAt: null,
    updatedAt: null
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
