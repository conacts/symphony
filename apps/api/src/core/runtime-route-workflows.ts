import type {
  RouteDecisionRecord,
  RouteHistoryEventRecord,
  RouteProjectionSnapshotRecord,
  RouteWorkflowHydrationState,
  RouteWorkflowRecord,
  RouteWorkflowStore
} from "@symphony/db";
import { SymphonyRouteWorkflowExistsError } from "@symphony/db";
import type {
  WorkflowPayload,
  WorkflowHistory,
  WorkflowJournalEvent,
  WorkflowNodeId,
  WorkflowProjection,
  WorkflowRouteResult,
  WorkflowRouter,
  WorkflowSession
} from "@symphony/router";

export type EnsuredRouteWorkflow = {
  workflow: RouteWorkflowRecord;
  created: boolean;
};

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

export type RecordedRouteWorkflowResult<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
  Policy = unknown,
> = {
  history: RouteHistoryEventRecord<Node>[];
  decision: RouteDecisionRecord<Node, Data, Policy>;
  snapshot: RouteProjectionSnapshotRecord<Node, Data>;
};

export type AppendedRouteCommandSettlement<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
> = {
  historyEvent: RouteHistoryEventRecord<Node>;
  snapshot: RouteProjectionSnapshotRecord<Node, Data> | null;
};

export type SymphonyRouteWorkflowPort = {
  ensureWorkflowForIssue<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
    repositoryKey: string;
    router: WorkflowRouter<Node, Data, Policy>;
    workflowId?: string;
    createdAt?: string;
  }): Promise<EnsuredRouteWorkflow>;
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
  recordRouteResult<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    workflowId: string;
    policy: Policy;
    result: WorkflowRouteResult<Node, Data>;
  }): Promise<RecordedRouteWorkflowResult<Node, Data, Policy>>;
  appendCommandSettlement<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
  >(input: {
    workflowId: string;
    commandId: string;
    status: "succeeded" | "failed";
    payload?: WorkflowPayload;
    recordedAt?: string;
    projection?: WorkflowProjection<Node, Data>;
  }): Promise<AppendedRouteCommandSettlement<Node, Data>>;
};

export function createRouteWorkflowPort(input: {
  routeWorkflowStore: RouteWorkflowStore;
}): SymphonyRouteWorkflowPort {
  return {
    async ensureWorkflowForIssue<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(ensureInput: {
      issueIdentifier: string;
      repositoryKey: string;
      router: WorkflowRouter<Node, Data, Policy>;
      workflowId?: string;
      createdAt?: string;
    }): Promise<EnsuredRouteWorkflow> {
      const existing = await input.routeWorkflowStore.getWorkflowForIssue(
        ensureInput.issueIdentifier
      );
      if (existing) {
        assertWorkflowRouterCompatibility({
          workflow: existing,
          repositoryKey: ensureInput.repositoryKey,
          router: ensureInput.router
        });
        return {
          workflow: existing,
          created: false
        };
      }

      try {
        const workflowId = await input.routeWorkflowStore.createWorkflow({
          workflowId: ensureInput.workflowId,
          repositoryKey: ensureInput.repositoryKey,
          issueIdentifier: ensureInput.issueIdentifier,
          routerName: ensureInput.router.definition().name,
          routerVersion: ensureInput.router.definition().version,
          createdAt: ensureInput.createdAt
        });
        const workflow = await input.routeWorkflowStore.getWorkflow(workflowId);
        if (!workflow) {
          throw new TypeError(
            `Route workflow ${workflowId} was created for issue ${ensureInput.issueIdentifier} but could not be loaded.`
          );
        }

        return {
          workflow,
          created: true
        };
      } catch (error) {
        if (!(error instanceof SymphonyRouteWorkflowExistsError)) {
          throw error;
        }

        const workflow = await input.routeWorkflowStore.getWorkflowForIssue(
          ensureInput.issueIdentifier
        );
        if (!workflow) {
          throw error;
        }

        assertWorkflowRouterCompatibility({
          workflow,
          repositoryKey: ensureInput.repositoryKey,
          router: ensureInput.router
        });
        return {
          workflow,
          created: false
        };
      }
    },
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
    },
    async recordRouteResult<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(recordInput: {
      workflowId: string;
      policy: Policy;
      result: WorkflowRouteResult<Node, Data>;
    }): Promise<RecordedRouteWorkflowResult<Node, Data, Policy>> {
      return await input.routeWorkflowStore.recordRouteResult({
        workflowId: recordInput.workflowId,
        policy: recordInput.policy,
        result: recordInput.result
      });
    },
    async appendCommandSettlement<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
    >(appendInput: {
      workflowId: string;
      commandId: string;
      status: "succeeded" | "failed";
      payload?: WorkflowPayload;
      recordedAt?: string;
      projection?: WorkflowProjection<Node, Data>;
    }): Promise<AppendedRouteCommandSettlement<Node, Data>> {
      return await input.routeWorkflowStore.appendHistoryEvent({
        workflowId: appendInput.workflowId,
        event: createCommandSettlementEvent<Node>({
          commandId: appendInput.commandId,
          status: appendInput.status,
          payload: appendInput.payload,
          recordedAt: appendInput.recordedAt
        }),
        projection: appendInput.projection
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

function createCommandSettlementEvent<
  Node extends WorkflowNodeId,
>(input: {
  commandId: string;
  status: "succeeded" | "failed";
  payload?: WorkflowPayload;
  recordedAt?: string;
}): Extract<WorkflowJournalEvent<Node>, { kind: "command_settled" }> {
  return {
    kind: "command_settled",
    commandId: input.commandId,
    status: input.status,
    payload: input.payload ?? null,
    recordedAt: input.recordedAt ?? new Date().toISOString()
  };
}

function assertWorkflowRouterCompatibility<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  workflow: RouteWorkflowRecord;
  repositoryKey: string;
  router: WorkflowRouter<Node, Data, Policy>;
}) {
  const definition = input.router.definition();

  if (input.workflow.repositoryKey !== input.repositoryKey) {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is bound to repository ${input.workflow.repositoryKey}, but ${input.repositoryKey} was requested.`
    );
  }

  if (input.workflow.routerName !== definition.name) {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is bound to router ${input.workflow.routerName}, but ${definition.name} was requested.`
    );
  }

  if (input.workflow.routerVersion !== definition.version) {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is bound to router version ${input.workflow.routerVersion}, but ${definition.version} was requested.`
    );
  }
}
