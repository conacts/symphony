import type {
  RouteDecisionRecord,
  RouteHistoryEventRecord,
  RouteWorkflowRecord,
  RouteWorkflowStore
} from "@symphony/db";
import {
  jsonValueSchema,
  type SymphonyRuntimeIssueCapabilityState,
  type SymphonyRuntimeWorkflowComparisonSignal,
  type SymphonyRuntimeWorkflowObservabilityResult
} from "@symphony/contracts";
import type {
  SymphonyRuntimeCapabilityOperatorPort,
  SymphonyRuntimeWorkflowReadPort
} from "./runtime-app-types.js";

type RuntimeWorkflowObservabilityService = {
  loadByWorkflowId(input: {
    workflowId: string;
    recordedAt: string;
    historyLimit?: number;
    decisionLimit?: number;
  }): Promise<SymphonyRuntimeWorkflowObservabilityResult | null>;
  loadByIssueIdentifier(input: {
    issueIdentifier: string;
    recordedAt: string;
    historyLimit?: number;
    decisionLimit?: number;
  }): Promise<SymphonyRuntimeWorkflowObservabilityResult | null>;
};

export function createRuntimeWorkflowObservabilityService(input: {
  routeWorkflowStore: RouteWorkflowStore;
  workflowRead: SymphonyRuntimeWorkflowReadPort;
  capabilityOperator: SymphonyRuntimeCapabilityOperatorPort;
  bindingScope?: RouteWorkflowRecord["bindingScope"];
}): RuntimeWorkflowObservabilityService {
  return {
    async loadByWorkflowId(loadInput) {
      const workflow = await input.routeWorkflowStore.getWorkflow(loadInput.workflowId);
      if (!workflow) {
        return null;
      }

      return await buildObservabilityResult({
        workflow,
        routeWorkflowStore: input.routeWorkflowStore,
        workflowRead: input.workflowRead,
        capabilityOperator: input.capabilityOperator,
        recordedAt: loadInput.recordedAt,
        historyLimit: loadInput.historyLimit,
        decisionLimit: loadInput.decisionLimit
      });
    },

    async loadByIssueIdentifier(loadInput) {
      const workflow = input.bindingScope
        ? await input.routeWorkflowStore.getWorkflowForScopedIssue({
            issueIdentifier: loadInput.issueIdentifier,
            bindingScope: input.bindingScope
          })
        : await input.routeWorkflowStore.getWorkflowForIssue(loadInput.issueIdentifier);
      if (!workflow) {
        return null;
      }

      return await buildObservabilityResult({
        workflow,
        routeWorkflowStore: input.routeWorkflowStore,
        workflowRead: input.workflowRead,
        capabilityOperator: input.capabilityOperator,
        recordedAt: loadInput.recordedAt,
        historyLimit: loadInput.historyLimit,
        decisionLimit: loadInput.decisionLimit
      });
    }
  };
}

async function buildObservabilityResult(input: {
  workflow: RouteWorkflowRecord;
  routeWorkflowStore: RouteWorkflowStore;
  workflowRead: SymphonyRuntimeWorkflowReadPort;
  capabilityOperator: SymphonyRuntimeCapabilityOperatorPort;
  recordedAt: string;
  historyLimit?: number;
  decisionLimit?: number;
}): Promise<SymphonyRuntimeWorkflowObservabilityResult> {
  const [history, decisions, snapshot, liveWorkflow] = await Promise.all([
    input.routeWorkflowStore.listHistory(input.workflow.workflowId),
    input.routeWorkflowStore.listDecisions(input.workflow.workflowId),
    input.routeWorkflowStore.getLatestSnapshot(input.workflow.workflowId),
    loadLiveWorkflow(input.routeWorkflowStore, input.workflow)
  ]);
  const latestHistory = takeTail(history, input.historyLimit);
  const latestDecisions = takeTail(decisions, input.decisionLimit);
  const settlementsByCommandId = buildSettlementsByCommandId(history);
  const signals = history.flatMap((event) => {
    if (event.kind !== "signal_recorded") {
      return [];
    }

    return [serializeSignal(event)];
  });
  const [trackerState, capability] =
    liveWorkflow && liveWorkflow.workflowId === input.workflow.workflowId
      ? await Promise.all([
          snapshot
            ? input.workflowRead
                .loadWorkflowLifecycleView({
                  issueIdentifier: input.workflow.issueIdentifier
                })
                .then((result) => result?.trackerState ?? null)
            : Promise.resolve(null),
          input.capabilityOperator.inspectByIssueIdentifier({
            issueIdentifier: input.workflow.issueIdentifier,
            recordedAt: input.recordedAt
          })
        ])
      : await Promise.all([
          Promise.resolve<string | null>(null),
          Promise.resolve<SymphonyRuntimeIssueCapabilityState | null>(null)
        ]);

  return {
    workflow: {
      workflowId: input.workflow.workflowId,
      trackerIssueId: input.workflow.trackerIssueId,
      repositoryKey: input.workflow.repositoryKey,
      issueIdentifier: input.workflow.issueIdentifier,
      bindingScope: input.workflow.bindingScope,
      routerPresetId: input.workflow.routerPresetId,
      routerName: input.workflow.routerName,
      routerVersion: input.workflow.routerVersion,
      archivedAt: input.workflow.archivedAt,
      insertedAt: input.workflow.insertedAt,
      updatedAt: input.workflow.updatedAt
    },
    trackerState,
    capability,
    snapshot: snapshot
      ? {
          eventSequence: snapshot.eventSequence,
          currentNode: snapshot.currentNode,
          terminal: snapshot.terminal,
          lastSignalId: snapshot.lastSignalId,
          lastDecisionId: snapshot.lastDecisionId,
          pendingCommandCount: snapshot.projection.pendingCommands.length,
          projection: jsonValueSchema.parse(snapshot.projection)
        }
      : null,
    replay: {
      recordedEventCount: history.length,
      recordedSignalCount: signals.length,
      recordedDecisionCount: decisions.length,
      recordedCommandCount: history.filter((event) => event.kind === "command_emitted")
        .length,
      settledCommandCount: history.filter((event) => event.kind === "command_settled")
        .length,
      signals
    },
    history: latestHistory.map((event) => ({
      eventId: event.eventId,
      eventSequence: event.eventSequence,
      kind: event.kind,
      recordedAt: event.recordedAt,
      signalId: event.signalId,
      signalType: event.signalType,
      signalSource: event.signalSource,
      decisionId: event.decisionId,
      commandId: event.commandId,
      fromNode: event.fromNode,
      toNode: event.toNode,
      edgeId: event.edgeId,
      reasonCode: event.reasonCode,
      event: jsonValueSchema.parse(event.event)
    })),
    decisions: latestDecisions.map((decision) =>
      serializeDecision(decision, settlementsByCommandId)
    ),
    filters: {
      historyLimit: input.historyLimit ?? null,
      decisionLimit: input.decisionLimit ?? null
    }
  };
}

async function loadLiveWorkflow(
  routeWorkflowStore: RouteWorkflowStore,
  workflow: RouteWorkflowRecord
): Promise<RouteWorkflowRecord | null> {
  return workflow.bindingScope
    ? await routeWorkflowStore.getWorkflowForScopedIssue({
        issueIdentifier: workflow.issueIdentifier,
        bindingScope: workflow.bindingScope
      })
    : await routeWorkflowStore.getWorkflowForIssue(workflow.issueIdentifier);
}

function takeTail<T>(
  entries: ReadonlyArray<T>,
  limit: number | undefined
): T[] {
  if (limit === undefined || limit >= entries.length) {
    return [...entries];
  }

  return entries.slice(-limit);
}

function serializeSignal(
  event: RouteHistoryEventRecord
): SymphonyRuntimeWorkflowComparisonSignal {
  if (event.event.kind !== "signal_recorded") {
    throw new TypeError(
      `Expected signal_recorded event ${event.eventId} but saw ${event.event.kind}.`
    );
  }

  return {
    id: event.event.signal.id,
    type: event.event.signal.type,
    source: event.event.signal.source,
    occurredAt: event.event.signal.occurredAt,
    causationId: event.event.signal.causationId,
    correlationId: event.event.signal.correlationId,
    payload: jsonValueSchema.parse(event.event.signal.payload)
  };
}

function buildSettlementsByCommandId(
  history: ReadonlyArray<RouteHistoryEventRecord>
): Map<
  string,
  {
    eventId: string;
    eventSequence: number;
    recordedAt: string;
    status: "succeeded" | "failed";
    payload: ReturnType<typeof jsonValueSchema.parse>;
  }
> {
  const settlementsByCommandId = new Map<
    string,
    {
      eventId: string;
      eventSequence: number;
      recordedAt: string;
      status: "succeeded" | "failed";
      payload: ReturnType<typeof jsonValueSchema.parse>;
    }
  >();

  for (const event of history) {
    if (event.kind !== "command_settled") {
      continue;
    }

    if (event.event.kind !== "command_settled") {
      throw new TypeError(
        `Expected command_settled event ${event.eventId} but saw ${event.event.kind}.`
      );
    }

    settlementsByCommandId.set(event.event.commandId, {
      eventId: event.eventId,
      eventSequence: event.eventSequence,
      recordedAt: event.recordedAt,
      status: event.event.status,
      payload: jsonValueSchema.parse(event.event.payload)
    });
  }

  return settlementsByCommandId;
}

function serializeDecision(
  decision: RouteDecisionRecord,
  settlementsByCommandId: ReadonlyMap<
    string,
    {
      eventId: string;
      eventSequence: number;
      recordedAt: string;
      status: "succeeded" | "failed";
      payload: ReturnType<typeof jsonValueSchema.parse>;
    }
  >
): SymphonyRuntimeWorkflowObservabilityResult["decisions"][number] {
  return {
    decisionId: decision.decisionId,
    eventSequence: decision.eventSequence,
    signalId: decision.signalId,
    fromNode: decision.fromNode,
    toNode: decision.toNode,
    edgeId: decision.edgeId,
    reasonCode: decision.reasonCode,
    policy: jsonValueSchema.parse(decision.policy),
    projectionBefore: jsonValueSchema.parse(decision.projectionBefore),
    projectionAfter: jsonValueSchema.parse(decision.projectionAfter),
    commands: decision.commands.map((command) => ({
      commandId: command.id,
      kind: command.kind,
      dedupeKey: command.dedupeKey,
      payload: jsonValueSchema.parse(command.payload),
      settled: settlementsByCommandId.get(command.id) ?? null
    })),
    trace: decision.trace.map((entry) => jsonValueSchema.parse(entry)),
    selectionMetadata:
      decision.selectionMetadata === null
        ? null
        : jsonValueSchema.parse(decision.selectionMetadata),
    recordedAt: decision.recordedAt,
    insertedAt: decision.insertedAt
  };
}
