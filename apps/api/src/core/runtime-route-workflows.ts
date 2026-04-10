import type {
  RouteWorkflowHydrationState,
  RouteWorkflowStore
} from "@symphony/db";
import type {
  WorkflowHistory,
  WorkflowNodeId,
  WorkflowProjection,
  WorkflowRouter,
  WorkflowSession
} from "@symphony/router";

export type RehydratedRouteWorkflowProjection<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
  Policy = unknown,
> = {
  hydrationState: RouteWorkflowHydrationState<Node, Data, Policy>;
  projection: WorkflowProjection<Node, Data>;
  policy: Policy;
};

export type ResumedRouteWorkflowSession<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
  Policy = unknown,
> = {
  hydrationState: RouteWorkflowHydrationState<Node, Data, Policy>;
  projection: WorkflowProjection<Node, Data>;
  session: WorkflowSession<Node, Data, Policy>;
  policy: Policy;
};

export type SymphonyRouteWorkflowPort = {
  loadHydrationStateByWorkflowId<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(
    workflowId: string
  ): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null>;
  loadHydrationStateByIssueIdentifier<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(
    issueIdentifier: string
  ): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null>;
  rehydrateProjectionByWorkflowId<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    workflowId: string;
    router: WorkflowRouter<Node, Data, Policy>;
    policy?: Policy;
  }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null>;
  rehydrateProjectionByIssueIdentifier<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
    router: WorkflowRouter<Node, Data, Policy>;
    policy?: Policy;
  }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null>;
  resumeSessionByWorkflowId<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    workflowId: string;
    router: WorkflowRouter<Node, Data, Policy>;
    policy?: Policy;
  }): Promise<ResumedRouteWorkflowSession<Node, Data, Policy> | null>;
  resumeSessionByIssueIdentifier<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
    router: WorkflowRouter<Node, Data, Policy>;
    policy?: Policy;
  }): Promise<ResumedRouteWorkflowSession<Node, Data, Policy> | null>;
};

export function createRouteWorkflowPort(input: {
  routeWorkflowStore: RouteWorkflowStore;
}): SymphonyRouteWorkflowPort {
  return {
    async loadHydrationStateByWorkflowId<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(workflowId: string): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null> {
      return await input.routeWorkflowStore.loadWorkflowHydrationState<Node, Data, Policy>(
        workflowId
      );
    },
    async loadHydrationStateByIssueIdentifier<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(
      issueIdentifier: string
    ): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null> {
      return await input.routeWorkflowStore.loadWorkflowHydrationStateByIssue<
        Node,
        Data,
        Policy
      >(issueIdentifier);
    },
    async rehydrateProjectionByWorkflowId<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(rehydrationInput: {
      workflowId: string;
      router: WorkflowRouter<Node, Data, Policy>;
      policy?: Policy;
    }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null> {
      const hydrationState = await input.routeWorkflowStore.loadWorkflowHydrationState<
        Node,
        Data,
        Policy
      >(rehydrationInput.workflowId);
      if (!hydrationState) {
        return null;
      }

      return await rehydrateRouteWorkflowProjection({
        hydrationState,
        router: rehydrationInput.router,
        policy: rehydrationInput.policy
      });
    },
    async rehydrateProjectionByIssueIdentifier<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(rehydrationInput: {
      issueIdentifier: string;
      router: WorkflowRouter<Node, Data, Policy>;
      policy?: Policy;
    }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null> {
      const hydrationState = await input.routeWorkflowStore.loadWorkflowHydrationStateByIssue<
        Node,
        Data,
        Policy
      >(rehydrationInput.issueIdentifier);
      if (!hydrationState) {
        return null;
      }

      return await rehydrateRouteWorkflowProjection({
        hydrationState,
        router: rehydrationInput.router,
        policy: rehydrationInput.policy
      });
    },
    async resumeSessionByWorkflowId<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(resumeInput: {
      workflowId: string;
      router: WorkflowRouter<Node, Data, Policy>;
      policy?: Policy;
    }): Promise<ResumedRouteWorkflowSession<Node, Data, Policy> | null> {
      const hydrationState = await input.routeWorkflowStore.loadWorkflowHydrationState<
        Node,
        Data,
        Policy
      >(resumeInput.workflowId);
      if (!hydrationState) {
        return null;
      }

      return await resumeRouteWorkflowSession({
        hydrationState,
        router: resumeInput.router,
        policy: resumeInput.policy
      });
    },
    async resumeSessionByIssueIdentifier<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(resumeInput: {
      issueIdentifier: string;
      router: WorkflowRouter<Node, Data, Policy>;
      policy?: Policy;
    }): Promise<ResumedRouteWorkflowSession<Node, Data, Policy> | null> {
      const hydrationState = await input.routeWorkflowStore.loadWorkflowHydrationStateByIssue<
        Node,
        Data,
        Policy
      >(resumeInput.issueIdentifier);
      if (!hydrationState) {
        return null;
      }

      return await resumeRouteWorkflowSession({
        hydrationState,
        router: resumeInput.router,
        policy: resumeInput.policy
      });
    }
  };
}

export async function rehydrateRouteWorkflowProjection<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
  Policy = unknown,
>(input: {
  hydrationState: RouteWorkflowHydrationState<Node, Data, Policy>;
  router: WorkflowRouter<Node, Data, Policy>;
  policy?: Policy;
}): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy>> {
  const policy = resolveHydrationPolicy(input);
  const tailHistory = toWorkflowHistory(input.hydrationState);
  const projection = input.hydrationState.snapshot
    ? await input.router.rehydrateAsync({
        projection: input.hydrationState.snapshot.projection,
        tailHistory,
        policy
      })
    : await input.router.projectAsync({
        workflowId: input.hydrationState.workflow.workflowId,
        history: tailHistory,
        policy
      });

  return {
    hydrationState: input.hydrationState,
    projection,
    policy
  };
}

export async function resumeRouteWorkflowSession<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
  Policy = unknown,
>(input: {
  hydrationState: RouteWorkflowHydrationState<Node, Data, Policy>;
  router: WorkflowRouter<Node, Data, Policy>;
  policy?: Policy;
}): Promise<ResumedRouteWorkflowSession<Node, Data, Policy>> {
  const rehydratedProjection = await rehydrateRouteWorkflowProjection(input);
  const session = await input.router.resumeSessionAsync({
    projection: rehydratedProjection.projection,
    history: toWorkflowHistory(input.hydrationState),
    policy: rehydratedProjection.policy
  });

  return {
    hydrationState: input.hydrationState,
    projection: rehydratedProjection.projection,
    session,
    policy: rehydratedProjection.policy
  };
}

function resolveHydrationPolicy<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  hydrationState: RouteWorkflowHydrationState<Node, Data, Policy>;
  policy?: Policy;
}): Policy {
  if (input.policy !== undefined) {
    return input.policy;
  }

  const persistedPolicy = input.hydrationState.latestDecision?.policy;
  if (persistedPolicy !== null && persistedPolicy !== undefined) {
    return persistedPolicy;
  }

  throw new TypeError(
    `Route workflow ${input.hydrationState.workflow.workflowId} requires an explicit policy because no persisted routing decision policy is available.`
  );
}

function toWorkflowHistory<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(
  hydrationState: RouteWorkflowHydrationState<Node, Data, Policy>
): WorkflowHistory<Node> {
  return hydrationState.tailHistory.map((historyEvent) => historyEvent.event);
}
