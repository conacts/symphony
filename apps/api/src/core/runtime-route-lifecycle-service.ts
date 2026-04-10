import type {
  SymphonyDispatchBootstrapRouter,
  SymphonyRunLifecycleRouter,
  SymphonyRunStartActivationRouter
} from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  createRuntimeDispatchBootstrapRouter
} from "./runtime-dispatch-bootstrap-routing.js";
import {
  createRuntimeRunLifecycleRouter
} from "./runtime-run-lifecycle-routing.js";
import {
  createRuntimeRunStartActivationRouter
} from "./runtime-run-start-activation-routing.js";
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
  const dispatchBootstrapRouter = await createRuntimeDispatchBootstrapRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    trackerConfig: input.trackerConfig,
    repositoryKey: input.repositoryKey,
    now: input.now
  });
  const runStartActivationRouter =
    await createRuntimeRunStartActivationRouter({
      routeWorkflows: input.routeWorkflows,
      tracker: input.tracker,
      now: input.now
    });
  const runLifecycleRouter = await createRuntimeRunLifecycleRouter({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    now: input.now
  });

  return {
    dispatchBootstrapRouter,
    runStartActivationRouter,
    runLifecycleRouter,
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

      const issue = await input.tracker.fetchIssueByIdentifier(
        input.trackerConfig,
        observationInput.issueIdentifier
      );
      if (!issue) {
        return false;
      }

      await runLifecycleRouter.observeIssueState({
        issue,
        runId: null,
        runMode: resolveActiveRunMode(hydration),
        recordedAt: observationInput.recordedAt
      });

      return true;
    }
  };
}

function resolveActiveRunMode(
  hydration: {
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

  return "implementation";
}
