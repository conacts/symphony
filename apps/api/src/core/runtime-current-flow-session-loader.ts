import type { RouteWorkflowHydrationState } from "@symphony/db";
import type {
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowPolicy
} from "@symphony/router";
import type { SymphonyTrackerConfig } from "@symphony/tracker";
import {
  resolveStoredRuntimeCurrentFlowRouting,
  type SymphonyRuntimeCurrentFlowRouting
} from "./runtime-current-flow-routing.js";
import {
  resumeRouteWorkflowSession,
  type ResumedRouteWorkflowSession,
  type SymphonyRouteWorkflowPort
} from "./runtime-route-workflows.js";

export type SymphonyRuntimeCurrentFlowLoadedSession = {
  routing: SymphonyRuntimeCurrentFlowRouting;
  resumed: ResumedRouteWorkflowSession<
    SymphonyCurrentFlowNode,
    SymphonyCurrentFlowData,
    SymphonyCurrentFlowPolicy
  >;
};

export type SymphonyRuntimeCurrentFlowSessionLoader = {
  resumeByWorkflowId(input: {
    workflowId: string;
  }): Promise<SymphonyRuntimeCurrentFlowLoadedSession | null>;
  resumeByIssueIdentifier(input: {
    issueIdentifier: string;
  }): Promise<SymphonyRuntimeCurrentFlowLoadedSession | null>;
};

export async function createRuntimeCurrentFlowSessionLoader(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  trackerConfig: SymphonyTrackerConfig;
  now?: () => Date;
}): Promise<SymphonyRuntimeCurrentFlowSessionLoader> {
  return {
    async resumeByWorkflowId({
      workflowId
    }): Promise<SymphonyRuntimeCurrentFlowLoadedSession | null> {
      const hydrationState =
        await input.routeWorkflows.loadHydrationStateByWorkflowId<
          SymphonyCurrentFlowNode,
          SymphonyCurrentFlowData,
          SymphonyCurrentFlowPolicy
        >(workflowId);
      if (!hydrationState) {
        return null;
      }

      return await loadStoredRuntimeCurrentFlowSession({
        hydrationState,
        trackerConfig: input.trackerConfig,
        now: input.now
      });
    },
    async resumeByIssueIdentifier({
      issueIdentifier
    }): Promise<SymphonyRuntimeCurrentFlowLoadedSession | null> {
      const hydrationState =
        await input.routeWorkflows.loadHydrationStateByIssueIdentifier<
          SymphonyCurrentFlowNode,
          SymphonyCurrentFlowData,
          SymphonyCurrentFlowPolicy
        >(issueIdentifier);
      if (!hydrationState) {
        return null;
      }

      return await loadStoredRuntimeCurrentFlowSession({
        hydrationState,
        trackerConfig: input.trackerConfig,
        now: input.now
      });
    }
  };
}

async function loadStoredRuntimeCurrentFlowSession(input: {
  hydrationState: RouteWorkflowHydrationState<
    SymphonyCurrentFlowNode,
    SymphonyCurrentFlowData,
    SymphonyCurrentFlowPolicy
  >;
  trackerConfig: SymphonyTrackerConfig;
  now?: () => Date;
}): Promise<SymphonyRuntimeCurrentFlowLoadedSession> {
  const routing = await resolveStoredRuntimeCurrentFlowRouting({
    trackerConfig: input.trackerConfig,
    workflow: input.hydrationState.workflow,
    now: input.now
  });
  const resumed = await resumeRouteWorkflowSession({
    hydrationState: input.hydrationState,
    router: routing.router,
    policy: routing.policy
  });

  return {
    routing,
    resumed
  };
}
