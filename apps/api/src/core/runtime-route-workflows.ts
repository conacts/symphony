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

export type SymphonyRouteWorkflowPort = {
  ensureWorkflowForIssue<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
    repositoryKey: string;
    bindingScope?: RouteWorkflowBindingScope | null;
    routerPresetId: string;
    router: WorkflowRouter<Node, Data, Policy>;
    createdAt: string;
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
  loadHydrationStateByScopedIssue<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
    bindingScope: RouteWorkflowBindingScope;
  }): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null>;
  loadReplayStateByWorkflowId<Node extends WorkflowNodeId = WorkflowNodeId>(
    workflowId: string
  ): Promise<RouteWorkflowReplayState<Node> | null>;
  loadReplayStateByIssueIdentifier<Node extends WorkflowNodeId = WorkflowNodeId>(
    issueIdentifier: string
  ): Promise<RouteWorkflowReplayState<Node> | null>;
  loadReplayStateByScopedIssue<Node extends WorkflowNodeId = WorkflowNodeId>(input: {
    issueIdentifier: string;
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
  rehydrateProjectionByIssueIdentifier<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
    router: WorkflowRouter<Node, Data, Policy>;
    policy: Policy;
  }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null>;
  rehydrateProjectionByScopedIssue<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
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
  resumeSessionByIssueIdentifier<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
    router: WorkflowRouter<Node, Data, Policy>;
    policy: Policy;
  }): Promise<ResumedRouteWorkflowSession<Node, Data, Policy> | null>;
  resumeSessionByScopedIssue<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
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
    async ensureWorkflowForIssue<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(ensureInput: {
      issueIdentifier: string;
      repositoryKey: string;
      bindingScope?: RouteWorkflowBindingScope | null;
      routerPresetId: string;
      router: WorkflowRouter<Node, Data, Policy>;
      createdAt: string;
    }): Promise<EnsuredRouteWorkflow> {
      const routerPresetId = normalizeRequiredText(
        ensureInput.routerPresetId,
        "routerPresetId"
      );
      const bindingScope = normalizeRouteWorkflowBindingScope(
        ensureInput.bindingScope
      );
      const existing = bindingScope
        ? await input.routeWorkflowStore.getWorkflowForScopedIssue({
            issueIdentifier: ensureInput.issueIdentifier,
            bindingScope
          })
        : await input.routeWorkflowStore.getWorkflowForIssue(
            ensureInput.issueIdentifier
          );
      if (existing) {
        assertWorkflowRouterCompatibility({
          workflow: existing,
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
          repositoryKey: ensureInput.repositoryKey,
          issueIdentifier: ensureInput.issueIdentifier,
          bindingScope,
          routerPresetId,
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

        const workflow = bindingScope
          ? await input.routeWorkflowStore.getWorkflowForScopedIssue({
              issueIdentifier: ensureInput.issueIdentifier,
              bindingScope
            })
          : await input.routeWorkflowStore.getWorkflowForIssue(
              ensureInput.issueIdentifier
            );
        if (!workflow) {
          throw error;
        }

        assertWorkflowRouterCompatibility({
          workflow,
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
    async loadHydrationStateByScopedIssue<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(scopedInput: {
      issueIdentifier: string;
      bindingScope: RouteWorkflowBindingScope;
    }): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null> {
      return await input.routeWorkflowStore.loadWorkflowHydrationStateByScopedIssue<
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
    async loadReplayStateByIssueIdentifier<Node extends WorkflowNodeId = WorkflowNodeId>(
      issueIdentifier: string
    ): Promise<RouteWorkflowReplayState<Node> | null> {
      const workflow = await input.routeWorkflowStore.getWorkflowForIssue(
        issueIdentifier
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
    async loadReplayStateByScopedIssue<Node extends WorkflowNodeId = WorkflowNodeId>(
      scopedInput: {
        issueIdentifier: string;
        bindingScope: RouteWorkflowBindingScope;
      }
    ): Promise<RouteWorkflowReplayState<Node> | null> {
      const workflow = await input.routeWorkflowStore.getWorkflowForScopedIssue(
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
    async rehydrateProjectionByIssueIdentifier<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(rehydrationInput: {
      issueIdentifier: string;
      router: WorkflowRouter<Node, Data, Policy>;
      policy: Policy;
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
    async rehydrateProjectionByScopedIssue<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(rehydrationInput: {
      issueIdentifier: string;
      bindingScope: RouteWorkflowBindingScope;
      router: WorkflowRouter<Node, Data, Policy>;
      policy: Policy;
    }): Promise<RehydratedRouteWorkflowProjection<Node, Data, Policy> | null> {
      const hydrationState =
        await input.routeWorkflowStore.loadWorkflowHydrationStateByScopedIssue<
          Node,
          Data,
          Policy
        >({
          issueIdentifier: rehydrationInput.issueIdentifier,
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
    async resumeSessionByIssueIdentifier<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(resumeInput: {
      issueIdentifier: string;
      router: WorkflowRouter<Node, Data, Policy>;
      policy: Policy;
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
    async resumeSessionByScopedIssue<
      Node extends WorkflowNodeId = WorkflowNodeId,
      Data = unknown,
      Policy = unknown,
    >(resumeInput: {
      issueIdentifier: string;
      bindingScope: RouteWorkflowBindingScope;
      router: WorkflowRouter<Node, Data, Policy>;
      policy: Policy;
    }): Promise<ResumedRouteWorkflowSession<Node, Data, Policy> | null> {
      const hydrationState =
        await input.routeWorkflowStore.loadWorkflowHydrationStateByScopedIssue<
          Node,
          Data,
          Policy
        >({
          issueIdentifier: resumeInput.issueIdentifier,
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

function assertWorkflowRouterCompatibility<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  workflow: RouteWorkflowRecord;
  repositoryKey: string;
  bindingScope: RouteWorkflowBindingScope | null;
  routerPresetId: string;
  router: WorkflowRouter<Node, Data, Policy>;
}) {
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

function assertStoredWorkflowRouterDefinition<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  workflow: Pick<RouteWorkflowRecord, "workflowId" | "routerName" | "routerVersion">;
  router: WorkflowRouter<Node, Data, Policy>;
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
