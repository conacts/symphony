import type { RouteWorkflowHydrationState } from "@symphony/db";
import type { WorkflowNodeId, WorkflowRouter } from "@symphony/router";
import type { SymphonyTrackerConfig } from "@symphony/tracker";
import {
  resolveStoredRuntimeRouterPreset,
  type SymphonyRuntimeRouterPresetSelection
} from "./runtime-workflow-presets.js";
import {
  resumeRouteWorkflowSession,
  type RouteWorkflowBindingScope,
  type SymphonyRouteWorkflowPort
} from "./runtime-route-workflows.js";
import type {
  SymphonyRuntimeWorkflowReceiveSession
} from "./runtime-workflow-session-types.js";

type RuntimeWorkflowNode = WorkflowNodeId;
type RuntimeWorkflowData = unknown;
type RuntimeWorkflowPolicy = unknown;
type RuntimeWorkflowRouter = WorkflowRouter<
  RuntimeWorkflowNode,
  RuntimeWorkflowData,
  RuntimeWorkflowPolicy
>;

export type SymphonyLoadedRuntimeWorkflowHydration = {
  routing: SymphonyRuntimeRouterPresetSelection;
  hydrationState: RouteWorkflowHydrationState<
    RuntimeWorkflowNode,
    RuntimeWorkflowData,
    RuntimeWorkflowPolicy
  >;
};

export type SymphonyLoadedRuntimeWorkflowSession = {
  routing: SymphonyRuntimeRouterPresetSelection;
  resumed: {
    hydrationState: RouteWorkflowHydrationState<
      RuntimeWorkflowNode,
      RuntimeWorkflowData,
      RuntimeWorkflowPolicy
    >;
    session: SymphonyRuntimeWorkflowReceiveSession<
      RuntimeWorkflowNode,
      RuntimeWorkflowData,
      RuntimeWorkflowPolicy
    >;
  };
};

export type SymphonyRuntimeWorkflowSessionLoader = {
  loadHydrationByWorkflowId(input: {
    workflowId: string;
  }): Promise<SymphonyLoadedRuntimeWorkflowHydration | null>;
  loadHydrationByIssueIdentifier(input: {
    issueIdentifier: string;
  }): Promise<SymphonyLoadedRuntimeWorkflowHydration | null>;
  loadHydrationByScopedIssue(input: {
    issueIdentifier: string;
    bindingScope: RouteWorkflowBindingScope;
  }): Promise<SymphonyLoadedRuntimeWorkflowHydration | null>;
  resumeByWorkflowId(input: {
    workflowId: string;
  }): Promise<SymphonyLoadedRuntimeWorkflowSession | null>;
  resumeByIssueIdentifier(input: {
    issueIdentifier: string;
  }): Promise<SymphonyLoadedRuntimeWorkflowSession | null>;
  resumeByScopedIssue(input: {
    issueIdentifier: string;
    bindingScope: RouteWorkflowBindingScope;
  }): Promise<SymphonyLoadedRuntimeWorkflowSession | null>;
};

export async function createRuntimeWorkflowSessionLoader(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  trackerConfig: SymphonyTrackerConfig;
  bindingScope?: RouteWorkflowBindingScope | null;
  now?: () => Date;
}): Promise<SymphonyRuntimeWorkflowSessionLoader> {
  const loadHydrationByWorkflowId: SymphonyRuntimeWorkflowSessionLoader["loadHydrationByWorkflowId"] =
    async ({ workflowId }) => {
      const hydrationState =
        await input.routeWorkflows.loadHydrationStateByWorkflowId<
          RuntimeWorkflowNode,
          RuntimeWorkflowData,
          RuntimeWorkflowPolicy
        >(workflowId);
      if (!hydrationState) {
        return null;
      }

      return await loadStoredRuntimeWorkflowHydration({
        hydrationState,
        trackerConfig: input.trackerConfig,
        now: input.now
      });
    };
  const loadHydrationByIssueIdentifier: SymphonyRuntimeWorkflowSessionLoader["loadHydrationByIssueIdentifier"] =
    async ({ issueIdentifier }) => {
      const hydrationState = input.bindingScope
        ? await input.routeWorkflows.loadHydrationStateByScopedIssue<
            RuntimeWorkflowNode,
            RuntimeWorkflowData,
            RuntimeWorkflowPolicy
          >({
            issueIdentifier,
            bindingScope: input.bindingScope
          })
        : await input.routeWorkflows.loadHydrationStateByIssueIdentifier<
            RuntimeWorkflowNode,
            RuntimeWorkflowData,
            RuntimeWorkflowPolicy
          >(issueIdentifier);
      if (!hydrationState) {
        return null;
      }

      return await loadStoredRuntimeWorkflowHydration({
        hydrationState,
        trackerConfig: input.trackerConfig,
        now: input.now
      });
    };
  const loadHydrationByScopedIssue: SymphonyRuntimeWorkflowSessionLoader["loadHydrationByScopedIssue"] =
    async ({ issueIdentifier, bindingScope }) => {
      const hydrationState =
        await input.routeWorkflows.loadHydrationStateByScopedIssue<
          RuntimeWorkflowNode,
          RuntimeWorkflowData,
          RuntimeWorkflowPolicy
        >({
          issueIdentifier,
          bindingScope
        });
      if (!hydrationState) {
        return null;
      }

      return await loadStoredRuntimeWorkflowHydration({
        hydrationState,
        trackerConfig: input.trackerConfig,
        now: input.now
      });
    };

  return {
    loadHydrationByWorkflowId,
    loadHydrationByIssueIdentifier,
    loadHydrationByScopedIssue,
    async resumeByWorkflowId({
      workflowId
    }): Promise<SymphonyLoadedRuntimeWorkflowSession | null> {
      const loaded = await loadHydrationByWorkflowId({
        workflowId
      });
      if (!loaded) {
        return null;
      }

      return await resumeLoadedRuntimeWorkflowSession({
        loaded
      });
    },
    async resumeByIssueIdentifier({
      issueIdentifier
    }): Promise<SymphonyLoadedRuntimeWorkflowSession | null> {
      const loaded = await loadHydrationByIssueIdentifier({
        issueIdentifier
      });
      if (!loaded) {
        return null;
      }

      return await resumeLoadedRuntimeWorkflowSession({
        loaded
      });
    },
    async resumeByScopedIssue({
      issueIdentifier,
      bindingScope
    }): Promise<SymphonyLoadedRuntimeWorkflowSession | null> {
      const loaded = await loadHydrationByScopedIssue({
        issueIdentifier,
        bindingScope
      });
      if (!loaded) {
        return null;
      }

      return await resumeLoadedRuntimeWorkflowSession({
        loaded
      });
    }
  };
}

async function loadStoredRuntimeWorkflowHydration(input: {
  hydrationState: RouteWorkflowHydrationState<
    RuntimeWorkflowNode,
    RuntimeWorkflowData,
    RuntimeWorkflowPolicy
  >;
  trackerConfig: SymphonyTrackerConfig;
  now?: () => Date;
}): Promise<SymphonyLoadedRuntimeWorkflowHydration> {
  const routing = await resolveStoredRuntimeRouterPreset({
    trackerConfig: input.trackerConfig,
    workflow: input.hydrationState.workflow,
    now: input.now
  });

  return {
    routing,
    hydrationState: input.hydrationState
  };
}

async function resumeLoadedRuntimeWorkflowSession(input: {
  loaded: SymphonyLoadedRuntimeWorkflowHydration;
}): Promise<SymphonyLoadedRuntimeWorkflowSession> {
  const resumed = await resumeRouteWorkflowSession({
    hydrationState: input.loaded.hydrationState,
    // Stored workflow resolution already verified that the persisted router
    // binding matches this preset router definition.
    router: input.loaded.routing.router as RuntimeWorkflowRouter,
    policy: input.loaded.routing.policy
  });

  return {
    routing: input.loaded.routing,
    resumed: {
      hydrationState: resumed.hydrationState,
      session: resumed.session
    }
  };
}
