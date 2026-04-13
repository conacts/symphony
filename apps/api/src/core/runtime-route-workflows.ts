import type {
  RouteDecisionRecord,
  RouteWorkflowBindingScope,
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
  WorkflowSignal,
  WorkflowSession
} from "@symphony/router";

export type EnsuredRouteWorkflow = {
  workflow: RouteWorkflowRecord;
  created: boolean;
};

export type { RouteWorkflowBindingScope };

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
  snapshot: RouteProjectionSnapshotRecord<Node, Data>;
};

export type RouteWorkflowReplayState<
  Node extends WorkflowNodeId = WorkflowNodeId,
> = {
  workflow: RouteWorkflowRecord;
  history: RouteHistoryEventRecord<Node>[];
  signals: WorkflowSignal[];
};

type PersistedRouteWorkflowRouter = {
  definition(): {
    name: string;
    version: string;
  };
};

export type SymphonyRouteWorkflowPort = {
  ensureWorkflowForIssue(input: {
    trackerIssueId: string;
    trackerIssueKey: string;
    repositoryKey: string;
    bindingScope?: RouteWorkflowBindingScope | null;
    routerPresetId: string;
    router: PersistedRouteWorkflowRouter;
    createdAt: string;
  }): Promise<EnsuredRouteWorkflow>;
  loadHydrationStateByWorkflowId<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(
    workflowId: string
  ): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null>;
  loadHydrationStateByTrackerIssueKey<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(
    trackerIssueKey: string
  ): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null>;
  loadHydrationStateByScopedTrackerIssueKey<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    trackerIssueKey: string;
    bindingScope: RouteWorkflowBindingScope;
  }): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null>;
  loadReplayStateByWorkflowId<Node extends WorkflowNodeId = WorkflowNodeId>(
    workflowId: string
  ): Promise<RouteWorkflowReplayState<Node> | null>;
  loadReplayStateByTrackerIssueKey<Node extends WorkflowNodeId = WorkflowNodeId>(
    trackerIssueKey: string
  ): Promise<RouteWorkflowReplayState<Node> | null>;
  loadReplayStateByScopedTrackerIssueKey<Node extends WorkflowNodeId = WorkflowNodeId>(input: {
    trackerIssueKey: string;
    bindingScope: RouteWorkflowBindingScope;
  }): Promise<RouteWorkflowReplayState<Node> | null>;
  rehydrateProjectionByWorkflowId<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    workflowId: string;
    router: WorkflowRouter<Node, Data, Policy>;
    policy: Policy;
  }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null>;
  rehydrateProjectionByTrackerIssueKey<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    trackerIssueKey: string;
    router: WorkflowRouter<Node, Data, Policy>;
    policy: Policy;
  }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null>;
  rehydrateProjectionByScopedTrackerIssueKey<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    trackerIssueKey: string;
    bindingScope: RouteWorkflowBindingScope;
    router: WorkflowRouter<Node, Data, Policy>;
    policy: Policy;
  }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null>;
  resumeSessionByWorkflowId<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    workflowId: string;
    router: WorkflowRouter<Node, Data, Policy>;
    policy: Policy;
  }): Promise<ResumedRouteWorkflowSession<Node, Data, Policy> | null>;
  resumeSessionByTrackerIssueKey<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    trackerIssueKey: string;
    router: WorkflowRouter<Node, Data, Policy>;
    policy: Policy;
  }): Promise<ResumedRouteWorkflowSession<Node, Data, Policy> | null>;
  resumeSessionByScopedTrackerIssueKey<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    trackerIssueKey: string;
    bindingScope: RouteWorkflowBindingScope;
    router: WorkflowRouter<Node, Data, Policy>;
    policy: Policy;
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
    payload: WorkflowPayload;
    recordedAt: string;
    projection: WorkflowProjection<Node, Data>;
  }): Promise<AppendedRouteCommandSettlement<Node, Data>>;
};

export function createRouteWorkflowPort(input: {
  routeWorkflowStore: RouteWorkflowStore;
}): SymphonyRouteWorkflowPort {
  return {
    async ensureWorkflowForIssue(ensureInput: {
      trackerIssueId: string;
      trackerIssueKey: string;
      repositoryKey: string;
      bindingScope?: RouteWorkflowBindingScope | null;
      routerPresetId: string;
      router: PersistedRouteWorkflowRouter;
      createdAt: string;
    }): Promise<EnsuredRouteWorkflow> {
      const routerPresetId = normalizeRequiredText(
        ensureInput.routerPresetId,
        "routerPresetId"
      );
      const bindingScope = normalizeRouteWorkflowBindingScope(
        ensureInput.bindingScope
      );
      const existing = await input.routeWorkflowStore.getWorkflowForTrackerIssueId(
        ensureInput.trackerIssueId
      );
      if (existing) {
        assertWorkflowRouterCompatibility({
          workflow: existing,
          trackerIssueKey: ensureInput.trackerIssueKey,
          repositoryKey: ensureInput.repositoryKey,
          bindingScope,
          routerPresetId,
          router: ensureInput.router
        });
        return {
          workflow: existing,
          created: false
        };
      }

      try {
        const workflowId = await input.routeWorkflowStore.createWorkflow({
          trackerIssueId: ensureInput.trackerIssueId,
          repositoryKey: ensureInput.repositoryKey,
          trackerIssueKey: ensureInput.trackerIssueKey,
          bindingScope,
          routerPresetId,
          routerName: ensureInput.router.definition().name,
          routerVersion: ensureInput.router.definition().version,
          createdAt: ensureInput.createdAt
        });
        const workflow = await input.routeWorkflowStore.getWorkflow(workflowId);
        if (!workflow) {
          throw new TypeError(
            `Route workflow ${workflowId} was created for issue ${ensureInput.trackerIssueKey} but could not be loaded.`
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

        const workflow = await input.routeWorkflowStore.getWorkflowForTrackerIssueId(
          ensureInput.trackerIssueId
        );
        if (!workflow) {
          throw error;
        }

        assertWorkflowRouterCompatibility({
          workflow,
          trackerIssueKey: ensureInput.trackerIssueKey,
          repositoryKey: ensureInput.repositoryKey,
          bindingScope,
          routerPresetId,
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
    async loadHydrationStateByTrackerIssueKey<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(
      trackerIssueKey: string
    ): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null> {
      return await input.routeWorkflowStore.loadWorkflowHydrationStateByTrackerIssueKey<
        Node,
        Data,
        Policy
      >(trackerIssueKey);
    },
    async loadHydrationStateByScopedTrackerIssueKey<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(scopedInput: {
      trackerIssueKey: string;
      bindingScope: RouteWorkflowBindingScope;
    }): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null> {
      return await input.routeWorkflowStore.loadWorkflowHydrationStateByScopedTrackerIssueKey<
        Node,
        Data,
        Policy
      >(scopedInput);
    },
    async loadReplayStateByWorkflowId<Node extends WorkflowNodeId = WorkflowNodeId>(
      workflowId: string
    ): Promise<RouteWorkflowReplayState<Node> | null> {
      const workflow = await input.routeWorkflowStore.getWorkflow(workflowId);
      if (!workflow) {
        return null;
      }

      const history = await input.routeWorkflowStore.listHistory<Node>(workflowId);
      return createRouteWorkflowReplayState({
        workflow,
        history
      });
    },
    async loadReplayStateByTrackerIssueKey<Node extends WorkflowNodeId = WorkflowNodeId>(
      trackerIssueKey: string
    ): Promise<RouteWorkflowReplayState<Node> | null> {
      const workflow = await input.routeWorkflowStore.getWorkflowForTrackerIssueKey(
        trackerIssueKey
      );
      if (!workflow) {
        return null;
      }

      const history = await input.routeWorkflowStore.listHistory<Node>(
        workflow.workflowId
      );
      return createRouteWorkflowReplayState({
        workflow,
        history
      });
    },
    async loadReplayStateByScopedTrackerIssueKey<Node extends WorkflowNodeId = WorkflowNodeId>(
      scopedInput: {
        trackerIssueKey: string;
        bindingScope: RouteWorkflowBindingScope;
      }
    ): Promise<RouteWorkflowReplayState<Node> | null> {
      const workflow = await input.routeWorkflowStore.getWorkflowForScopedTrackerIssueKey(
        scopedInput
      );
      if (!workflow) {
        return null;
      }

      const history = await input.routeWorkflowStore.listHistory<Node>(
        workflow.workflowId
      );
      return createRouteWorkflowReplayState({
        workflow,
        history
      });
    },
    async rehydrateProjectionByWorkflowId<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(rehydrationInput: {
      workflowId: string;
      router: WorkflowRouter<Node, Data, Policy>;
      policy: Policy;
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
    async rehydrateProjectionByTrackerIssueKey<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(rehydrationInput: {
      trackerIssueKey: string;
      router: WorkflowRouter<Node, Data, Policy>;
      policy: Policy;
    }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null> {
      const hydrationState = await input.routeWorkflowStore.loadWorkflowHydrationStateByTrackerIssueKey<
        Node,
        Data,
        Policy
      >(rehydrationInput.trackerIssueKey);
      if (!hydrationState) {
        return null;
      }

      return await rehydrateRouteWorkflowProjection({
        hydrationState,
        router: rehydrationInput.router,
        policy: rehydrationInput.policy
      });
    },
    async rehydrateProjectionByScopedTrackerIssueKey<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(rehydrationInput: {
      trackerIssueKey: string;
      bindingScope: RouteWorkflowBindingScope;
      router: WorkflowRouter<Node, Data, Policy>;
      policy: Policy;
    }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null> {
      const hydrationState =
        await input.routeWorkflowStore.loadWorkflowHydrationStateByScopedTrackerIssueKey<
          Node,
          Data,
          Policy
        >({
          trackerIssueKey: rehydrationInput.trackerIssueKey,
          bindingScope: rehydrationInput.bindingScope
        });
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
      policy: Policy;
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
    async resumeSessionByTrackerIssueKey<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(resumeInput: {
      trackerIssueKey: string;
      router: WorkflowRouter<Node, Data, Policy>;
      policy: Policy;
    }): Promise<ResumedRouteWorkflowSession<Node, Data, Policy> | null> {
      const hydrationState = await input.routeWorkflowStore.loadWorkflowHydrationStateByTrackerIssueKey<
        Node,
        Data,
        Policy
      >(resumeInput.trackerIssueKey);
      if (!hydrationState) {
        return null;
      }

      return await resumeRouteWorkflowSession({
        hydrationState,
        router: resumeInput.router,
        policy: resumeInput.policy
      });
    },
    async resumeSessionByScopedTrackerIssueKey<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(resumeInput: {
      trackerIssueKey: string;
      bindingScope: RouteWorkflowBindingScope;
      router: WorkflowRouter<Node, Data, Policy>;
      policy: Policy;
    }): Promise<ResumedRouteWorkflowSession<Node, Data, Policy> | null> {
      const hydrationState =
        await input.routeWorkflowStore.loadWorkflowHydrationStateByScopedTrackerIssueKey<
          Node,
          Data,
          Policy
        >({
          trackerIssueKey: resumeInput.trackerIssueKey,
          bindingScope: resumeInput.bindingScope
        });
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
      payload: WorkflowPayload;
      recordedAt: string;
      projection: WorkflowProjection<Node, Data>;
    }): Promise<AppendedRouteCommandSettlement<Node, Data>> {
      return await input.routeWorkflowStore.appendHistoryEventWithSnapshot({
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
  policy: Policy;
}): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy>> {
  assertStoredWorkflowRouterDefinition({
    workflow: input.hydrationState.workflow,
    router: input.router
  });
  const policy = requireDefinedPolicy(
    input.policy,
    input.hydrationState.workflow.workflowId
  );
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
  policy: Policy;
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

function toWorkflowHistory<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(
  hydrationState: RouteWorkflowHydrationState<Node, Data, Policy>
): WorkflowHistory<Node> {
  return hydrationState.tailHistory.map((historyEvent) => historyEvent.event);
}

function createRouteWorkflowReplayState<Node extends WorkflowNodeId>(input: {
  workflow: RouteWorkflowRecord;
  history: RouteHistoryEventRecord<Node>[];
}): RouteWorkflowReplayState<Node> {
  return {
    workflow: input.workflow,
    history: input.history,
    signals: input.history.flatMap((historyEvent) =>
      historyEvent.event.kind === "signal_recorded"
        ? [historyEvent.event.signal]
        : []
    )
  };
}

function createCommandSettlementEvent<
  Node extends WorkflowNodeId,
>(input: {
  commandId: string;
  status: "succeeded" | "failed";
  payload: WorkflowPayload;
  recordedAt: string;
}): Extract<WorkflowJournalEvent<Node>, { kind: "command_settled" }> {
  return {
    kind: "command_settled",
    commandId: normalizeRequiredText(input.commandId, "commandId"),
    status: input.status,
    payload: input.payload,
    recordedAt: normalizeRequiredText(input.recordedAt, "recordedAt")
  };
}

function requireDefinedPolicy<Policy>(
  policy: Policy,
  workflowId: string
): Policy {
  if (policy === undefined) {
    throw new TypeError(
      `Route workflow ${workflowId} requires an explicit routing policy.`
    );
  }

  return policy;
}

function normalizeRequiredText(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${field} is required.`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}

function assertWorkflowRouterCompatibility(input: {
  workflow: RouteWorkflowRecord;
  trackerIssueKey: string;
  repositoryKey: string;
  bindingScope: RouteWorkflowBindingScope | null;
  routerPresetId: string;
  router: PersistedRouteWorkflowRouter;
}) {
  if (input.workflow.trackerIssueKey !== input.trackerIssueKey) {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is bound to issue identifier ${input.workflow.trackerIssueKey}, but ${input.trackerIssueKey} was requested.`
    );
  }

  assertWorkflowBindingScopeCompatibility({
    workflow: input.workflow,
    bindingScope: input.bindingScope
  });

  if (input.workflow.repositoryKey !== input.repositoryKey) {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is bound to repository ${input.workflow.repositoryKey}, but ${input.repositoryKey} was requested.`
    );
  }

  if (input.workflow.routerPresetId !== input.routerPresetId) {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is bound to router preset ${input.workflow.routerPresetId}, but ${input.routerPresetId} was requested.`
    );
  }

  assertStoredWorkflowRouterDefinition(input);
}

function assertStoredWorkflowRouterDefinition(input: {
  workflow: Pick<RouteWorkflowRecord, "workflowId" | "routerName" | "routerVersion">;
  router: PersistedRouteWorkflowRouter;
}) {
  const definition = input.router.definition();

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

function assertWorkflowBindingScopeCompatibility(input: {
  workflow: Pick<RouteWorkflowRecord, "workflowId" | "bindingScope">;
  bindingScope: RouteWorkflowBindingScope | null;
}) {
  if (!input.bindingScope) {
    if (input.workflow.bindingScope !== null) {
      throw new TypeError(
        `Route workflow ${input.workflow.workflowId} is bound to a hosted workspace scope and cannot be loaded through the unscoped workflow path.`
      );
    }
    return;
  }

  if (!input.workflow.bindingScope) {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is unscoped and cannot be loaded through hosted workspace scope ${input.bindingScope.organizationId}/${input.bindingScope.linearWorkspaceIdentityId}.`
    );
  }

  if (
    input.workflow.bindingScope.organizationId !== input.bindingScope.organizationId ||
    input.workflow.bindingScope.linearWorkspaceIdentityId !==
      input.bindingScope.linearWorkspaceIdentityId
  ) {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is bound to hosted workspace scope ${input.workflow.bindingScope.organizationId}/${input.workflow.bindingScope.linearWorkspaceIdentityId}, not ${input.bindingScope.organizationId}/${input.bindingScope.linearWorkspaceIdentityId}.`
    );
  }
}

function normalizeRouteWorkflowBindingScope(
  value: RouteWorkflowBindingScope | null | undefined
): RouteWorkflowBindingScope | null {
  if (value === null || value === undefined) {
    return null;
  }

  return {
    organizationId: normalizeRequiredText(
      value.organizationId,
      "bindingScope.organizationId"
    ),
    linearWorkspaceIdentityId: normalizeRequiredText(
      value.linearWorkspaceIdentityId,
      "bindingScope.linearWorkspaceIdentityId"
    )
  };
}
