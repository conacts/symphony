import type {
  SymphonyDispatchBootstrapRouter,
  SymphonyRunLifecycleRouter,
  SymphonyRunStartActivationRouter
} from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  createRuntimeCurrentFlowRouting
} from "./runtime-current-flow-routing.js";
import {
  createRuntimeDispatchBootstrapRouter
} from "./runtime-dispatch-bootstrap-routing.js";
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
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowPolicy
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerConfig
} from "@symphony/tracker";

export type SymphonyRuntimeRouteLifecycleService = {
  dispatchBootstrapRouter: SymphonyDispatchBootstrapRouter;
  runStartActivationRouter: SymphonyRunStartActivationRouter;
  runLifecycleRouter: SymphonyRunLifecycleRouter;
  observeTrackerStateByIdentifier(input: {
    issueIdentifier: string;
    recordedAt: string;
    runId?: string | null;
    runMode?: SymphonyRunMode | null;
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
  const observeTrackerStateByIdentifier: SymphonyRuntimeRouteLifecycleService["observeTrackerStateByIdentifier"] =
    async (observationInput) => {
      const observed = await trackerStateObservationRouter.observe(
        observationInput
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

      return await observeTrackerStateByIdentifier({
        issueIdentifier: observationInput.issueIdentifier,
        recordedAt: observationInput.recordedAt,
        runMode: resolveActiveRunMode(hydration)
      });
    }
  };
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
