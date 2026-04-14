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
import {
  createSymphonyIntelligentFlowDefaultModuleRegistry,
  projectWorkflowCapabilityProjection,
  readSymphonyIntelligentFlowRouterDecision
} from "@symphony/router";
import type {
  SymphonyRuntimeCapabilityOperatorPort,
  SymphonyRuntimeWorkflowReadPort
} from "./runtime-app-types.js";

const intelligentFlowModuleRegistry =
  createSymphonyIntelligentFlowDefaultModuleRegistry();

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
  const capabilityProjection = projectWorkflowCapabilityProjection({
    workflowId: input.workflow.workflowId,
    history: history.map((event) => event.event)
  });
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
  const routerDecision = buildRouterDecisionSummary(decisions);
  const recentModuleRuns = buildRecentModuleRuns({
    decisions,
    capabilityProjection
  });
  const currentModule = buildCurrentModuleSummary({
    capability,
    capabilityProjection,
    recentModuleRuns,
    routerDecision
  });

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
    routerDecision,
    currentModule,
    recentModuleRuns,
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

function buildRouterDecisionSummary(
  decisions: ReadonlyArray<RouteDecisionRecord>
): SymphonyRuntimeWorkflowObservabilityResult["routerDecision"] {
  const latestDecision = [...decisions]
    .sort((left, right) => right.eventSequence - left.eventSequence)
    .find((decision) => readIntelligentFlowRouterDecisionOrNull(decision.selectionMetadata));
  if (!latestDecision) {
    return null;
  }

  const routerDecision = readIntelligentFlowRouterDecisionOrNull(
    latestDecision.selectionMetadata
  );
  if (!routerDecision) {
    return null;
  }

  return {
    decisionId: routerDecision.decisionId,
    recordedAt: routerDecision.recordedAt,
    policyId: routerDecision.policyId,
    reasonCode: latestDecision.reasonCode,
    selectionMode: routerDecision.selectionMode,
    selectionSummary: routerDecision.selectionSummary,
    selectionRationale: routerDecision.selectionRationale,
    confidence: routerDecision.confidence,
    fallbackReason: routerDecision.fallbackReason,
    selectedModule: serializeModule(routerDecision.selectedModuleId),
    admissibleCandidates: routerDecision.candidateSet.admissible.map((candidate) => ({
      module: serializeModule(candidate.moduleId),
      rank: candidate.rank,
      reasonCode: candidate.reasonCode,
      summary: candidate.summary,
      selected: candidate.moduleId === routerDecision.selectedModuleId
    })),
    rejectedCandidates: routerDecision.candidateSet.rejected.map((candidate) => ({
      module: serializeModule(candidate.moduleId),
      rank: null,
      reasonCode: candidate.reasonCode,
      summary: candidate.summary,
      selected: false
    }))
  };
}

function buildRecentModuleRuns(input: {
  decisions: ReadonlyArray<RouteDecisionRecord>;
  capabilityProjection: ReturnType<typeof projectWorkflowCapabilityProjection>;
}): SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"] {
  const decisionByExecutionId = buildModuleDecisionByExecutionId(input.decisions);
  const pendingClarification = input.capabilityProjection.pendingClarification;
  const attempts = input.capabilityProjection.capabilityStatusesByEpoch.flatMap(
    (epoch) => epoch.attempts
  );

  return attempts
    .map((attempt) => {
      const decision = decisionByExecutionId.get(attempt.executionId) ?? null;

      return {
        executionId: attempt.executionId,
        module: serializeModule(attempt.capabilityId),
        workEpoch: attempt.workEpoch,
        attempt: attempt.attempt,
        state: toModuleObservationState(attempt.status),
        summary: resolveAttemptSummary({
          attempt,
          pendingClarification
        }),
        modelProfileId: attempt.modelProfileId,
        selectedAt: decision?.recordedAt ?? attempt.startedAt,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        retryable: attempt.retryable,
        reasonCode: attempt.reasonCode,
        failureKind: attempt.failureKind,
        evidenceProduced: attempt.evidenceProduced.map((evidence) => ({
          evidenceId: evidence.evidenceId,
          summary: evidence.summary,
          artifacts: evidence.artifacts.map((artifact) => ({
            label: artifact.label,
            uri: artifact.uri
          }))
        })),
        decision
      };
    })
    .sort(compareModuleRunRecency)
    .slice(0, 10);
}

function buildCurrentModuleSummary(input: {
  capability: SymphonyRuntimeIssueCapabilityState | null;
  capabilityProjection: ReturnType<typeof projectWorkflowCapabilityProjection>;
  recentModuleRuns: SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"];
  routerDecision: SymphonyRuntimeWorkflowObservabilityResult["routerDecision"];
}): SymphonyRuntimeWorkflowObservabilityResult["currentModule"] {
  if (
    input.capability?.planKind === "execute" &&
    input.capability.capabilityId !== null &&
    input.capability.workEpoch !== null
  ) {
    return {
      executionId: null,
      module: serializeModule(input.capability.capabilityId),
      workEpoch: input.capability.workEpoch,
      attempt: null,
      state: "selected",
      summary: input.capability.summary,
      modelProfileId: input.capability.modelProfileId,
      selectedAt: input.capability.decidedAt,
      startedAt: null,
      completedAt: null,
      retryable: null,
      reasonCode: null,
      failureKind: null,
      evidenceProduced: [],
      decision:
        input.routerDecision?.selectedModule.moduleId ===
        input.capability.capabilityId
          ? {
              decisionId: input.routerDecision.decisionId,
              recordedAt: input.routerDecision.recordedAt,
              reasonCode: input.routerDecision.reasonCode,
              selectionMode: input.routerDecision.selectionMode,
              selectionSummary: input.routerDecision.selectionSummary,
              selectionRationale: input.routerDecision.selectionRationale
            }
          : null
    };
  }

  if (
    input.capability?.planKind === "awaiting_input" &&
    input.capability.pendingClarification?.raisedByCapabilityId !== null &&
    input.capability.workEpoch !== null
  ) {
    const pendingClarification = input.capability.pendingClarification;
    if (
      pendingClarification === null ||
      pendingClarification.raisedByCapabilityId === null
    ) {
      throw new TypeError(
        "Awaiting-input capability observability requires a raisedByCapabilityId."
      );
    }

    const matchingRun = findLatestModuleRun(input.recentModuleRuns, {
      moduleId: pendingClarification.raisedByCapabilityId,
      workEpoch: input.capability.workEpoch
    });
    if (matchingRun) {
      return {
        ...matchingRun,
        summary: pendingClarification.summary
      };
    }

    return {
      executionId: null,
      module: serializeModule(pendingClarification.raisedByCapabilityId),
      workEpoch: input.capability.workEpoch,
      attempt: null,
      state: "clarification_requested",
      summary: pendingClarification.summary,
      modelProfileId: null,
      selectedAt: input.capability.decidedAt,
      startedAt: null,
      completedAt: null,
      retryable: null,
      reasonCode: null,
      failureKind: null,
      evidenceProduced: [],
      decision: null
    };
  }

  if (input.capability?.planKind === "blocked") {
    const blockedRun = input.recentModuleRuns.find((run) => run.state === "blocked");
    if (blockedRun) {
      return {
        ...blockedRun,
        summary: input.capability.summary
      };
    }
  }

  return (
    input.recentModuleRuns.find(
      (run) =>
        run.state === "started" ||
        run.state === "clarification_requested" ||
        run.state === "blocked"
    ) ?? null
  );
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

function serializeModule(
  moduleId: string
): SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"][number]["module"] {
  if (!intelligentFlowModuleRegistry.hasModuleId(moduleId)) {
    throw new TypeError(
      `Unknown intelligent-flow module ${JSON.stringify(moduleId)} in workflow observability.`
    );
  }

  const definition = intelligentFlowModuleRegistry.getModuleDefinition(moduleId);

  return {
    moduleId: definition.id,
    phase: definition.phase,
    executionKind: definition.executionKind,
    summary: definition.summary,
    description: definition.description,
    enabledByDefault: definition.enabledByDefault,
    runtimeSupported: intelligentFlowModuleRegistry.isModuleRuntimeSupported({
      moduleId: definition.id
    }),
    supportedModelProfileIds: [...definition.supportedModelProfileIds],
    producesEvidenceIds: [...definition.producesEvidenceIds],
    requiresEvidenceIds: [...definition.requiresEvidenceIds]
  };
}

function buildModuleDecisionByExecutionId(
  decisions: ReadonlyArray<RouteDecisionRecord>
): Map<
  string,
  SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"][number]["decision"]
> {
  const decisionByExecutionId = new Map<
    string,
    SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"][number]["decision"]
  >();

  for (const decision of decisions) {
    const intelligentFlowDecision = readIntelligentFlowRouterDecisionOrNull(
      decision.selectionMetadata
    );
    const decisionSummary = {
      decisionId: decision.decisionId,
      recordedAt: decision.recordedAt,
      reasonCode: decision.reasonCode,
      selectionMode: intelligentFlowDecision?.selectionMode ?? null,
      selectionSummary: intelligentFlowDecision?.selectionSummary ?? null,
      selectionRationale: intelligentFlowDecision?.selectionRationale ?? null
    } satisfies NonNullable<
      SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"][number]["decision"]
    >;

    for (const command of decision.commands) {
      if (command.kind !== "capability.execute") {
        continue;
      }

      if (decisionByExecutionId.has(command.id)) {
        throw new TypeError(
          `Module observability recorded duplicate capability.execute decision for execution ${JSON.stringify(command.id)}.`
        );
      }

      decisionByExecutionId.set(command.id, decisionSummary);
    }
  }

  return decisionByExecutionId;
}

function readIntelligentFlowRouterDecisionOrNull(
  value: Record<string, unknown> | null
) {
  if (value === null) {
    return null;
  }

  try {
    return readSymphonyIntelligentFlowRouterDecision(value);
  } catch {
    return null;
  }
}

function resolveAttemptSummary(input: {
  attempt: ReturnType<typeof projectWorkflowCapabilityProjection>["latestAttempts"][number];
  pendingClarification: ReturnType<typeof projectWorkflowCapabilityProjection>["pendingClarification"];
}): string {
  if (
    input.attempt.status === "clarification_requested" &&
    input.pendingClarification !== null &&
    input.pendingClarification.raisedByCapabilityId === input.attempt.capabilityId &&
    input.pendingClarification.workEpoch === input.attempt.workEpoch
  ) {
    return input.pendingClarification.summary;
  }

  return input.attempt.summary;
}

function toModuleObservationState(
  status: ReturnType<typeof projectWorkflowCapabilityProjection>["latestAttempts"][number]["status"]
): SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"][number]["state"] {
  if (status === "planned") {
    throw new TypeError(
      "Workflow observability cannot expose a persisted module run in planned state."
    );
  }

  return status;
}

function compareModuleRunRecency(
  left: SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"][number],
  right: SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"][number]
): number {
  const leftAt = left.completedAt ?? left.startedAt ?? left.selectedAt;
  const rightAt = right.completedAt ?? right.startedAt ?? right.selectedAt;
  if (leftAt !== rightAt) {
    return rightAt.localeCompare(leftAt);
  }

  if (left.workEpoch !== right.workEpoch) {
    return right.workEpoch - left.workEpoch;
  }

  return (right.attempt ?? 0) - (left.attempt ?? 0);
}

function findLatestModuleRun(
  runs: SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"],
  input: {
    moduleId: string;
    workEpoch: number;
  }
): SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"][number] | null {
  return (
    runs.find(
      (run) =>
        run.module.moduleId === input.moduleId && run.workEpoch === input.workEpoch
    ) ?? null
  );
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
