import type {
  RouteWorkflowCapabilityPlannerCommandRecord,
  RouteWorkflowStore
} from "@symphony/db";
import {
  createSymphonyCapabilityBlockedSignal,
  createSymphonyCapabilityChangesRequestedSignal,
  createSymphonyCapabilityCompletedSignal,
  createSymphonyCapabilityExecutionCommand,
  createSymphonyCapabilityFailedSignal,
  createSymphonyCapabilityStartedSignal,
  createSymphonyWorkflowClarificationRequestedSignal,
  executeWorkflowCapabilityCommand,
  projectWorkflowCapabilityProjection,
  type SymphonyCapabilityPresetPolicyId,
  type SymphonyCapabilityEvidenceId,
  type SymphonyCapabilityId,
  type SymphonyCapabilityModelProfileId,
  type SymphonyWorkflowCapabilityExecutionCommand,
  type SymphonyWorkflowTicketExecutionContract,
  type WorkflowCapabilityAttempt,
  type WorkflowCapabilityExecutionEngine,
  type WorkflowCapabilityExecutionResult,
  type WorkflowCapabilityProjection,
  type WorkflowHistory,
  type WorkflowSignal
} from "@symphony/router";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type {
  SymphonyRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import { normalizeWorkflowToken } from "./runtime-route-workflow-command-utils.js";
import type {
  SymphonyCapabilityPlanningResult,
  SymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";
import {
  createSymphonyInProcessCapabilityExecutionEngine
} from "./symphony-in-process-capability-execution.js";

type SymphonyCapabilityPlannerCommandRecord = RouteWorkflowCapabilityPlannerCommandRecord<
  SymphonyWorkflowTicketExecutionContract,
  SymphonyCapabilityId,
  SymphonyCapabilityModelProfileId
>;

type SymphonyCapabilityExecutionAttemptContext = {
  workEpoch: number;
  attempt: number;
};

export type SymphonyCapabilityExecutionAdvanceResult =
  | {
      kind: "not_executed";
      planning: SymphonyCapabilityPlanningResult;
    }
  | {
      kind: "executed";
      planning: SymphonyCapabilityPlanningResult;
      command: SymphonyCapabilityPlannerCommandRecord;
      execution: {
        command: SymphonyWorkflowCapabilityExecutionCommand;
        result: WorkflowCapabilityExecutionResult<
          SymphonyCapabilityId,
          SymphonyCapabilityEvidenceId,
          SymphonyCapabilityModelProfileId
        >;
        startedSignal: WorkflowSignal;
        terminalSignal: WorkflowSignal;
      };
      nextPlanning: SymphonyCapabilityPlanningResult;
    };

export type SymphonyCapabilityExecutionService = {
  advanceByWorkflowId(input: {
    workflowId: string;
    recordedAt: string;
    policyId?: SymphonyCapabilityPresetPolicyId;
  }): Promise<SymphonyCapabilityExecutionAdvanceResult>;
};

export function createSymphonyCapabilityExecutionService(input: {
  capabilityPlanning: SymphonyCapabilityPlanningService;
  routeWorkflowStore: RouteWorkflowStore;
  routeWorkflows: SymphonyRouteWorkflowPort;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  engine?: WorkflowCapabilityExecutionEngine<
    SymphonyWorkflowTicketExecutionContract,
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
}): SymphonyCapabilityExecutionService {
  const engine =
    input.engine ?? createSymphonyInProcessCapabilityExecutionEngine();

  return {
    async advanceByWorkflowId(advanceInput) {
      const workflowId = requireNonEmptyText(
        advanceInput.workflowId,
        "workflowId"
      );
      const recordedAt = requireNonEmptyText(
        advanceInput.recordedAt,
        "recordedAt"
      );
      const planning = await input.capabilityPlanning.planByWorkflowId({
        workflowId,
        recordedAt,
        policyId: advanceInput.policyId
      });

      if (planning.plan.kind !== "execute") {
        return {
          kind: "not_executed",
          planning
        };
      }

      const persistedCommand = requirePlannerCommand(planning);
      const loaded = await input.sessionLoader.resumeByWorkflowId({
        workflowId
      });
      if (!loaded) {
        throw new TypeError(
          `Capability execution cannot resume route workflow ${workflowId}.`
        );
      }

      const history = await input.routeWorkflowStore.listHistory(workflowId);
      const executionContext = deriveExecutionAttemptContext({
        workflowId,
        history: history.map((entry) => entry.event),
        capabilityId: planning.plan.decision.capabilityId,
        workEpoch: planning.plan.decision.workEpoch
      });
      const executionCommand = createExecutionCommandWithContext({
        command: persistedCommand.command,
        context: executionContext
      });
      const executionResult = await executeWorkflowCapabilityCommand({
        engine,
        command: executionCommand
      });

      assertExecutionResultMatchesCommand({
        command: executionCommand,
        result: executionResult,
        context: executionContext
      });

      const startedAt = recordedAt;
      const terminalAt = incrementIsoTimestamp(recordedAt, 1);
      const replannedAt = incrementIsoTimestamp(recordedAt, 2);
      const startedSignal = createSymphonyCapabilityStartedSignal({
        id: buildCapabilitySignalId({
          workflowId,
          executionId: executionCommand.id,
          signalKind: "started",
          recordedAt: startedAt
        }),
        occurredAt: startedAt,
        source: "runtime",
        workflowId,
        executionId: executionResult.executionId,
        capabilityId: executionResult.capabilityId,
        modelProfileId: executionCommand.payload.modelProfileId,
        workEpoch: executionContext.workEpoch,
        attempt: executionContext.attempt,
        summary: buildStartedSummary(executionCommand.payload.capabilityId),
        causationId: executionCommand.id,
        correlationId: planning.contract.issueIdentifier
      });
      const terminalSignal = createTerminalSignal({
        workflowId,
        recordedAt: terminalAt,
        result: executionResult,
        command: executionCommand,
        correlationId: planning.contract.issueIdentifier
      });

      await recordSignal({
        workflowId,
        routeWorkflows: input.routeWorkflows,
        sessionLoaderResult: loaded,
        signal: startedSignal
      });
      await recordSignal({
        workflowId,
        routeWorkflows: input.routeWorkflows,
        sessionLoaderResult: loaded,
        signal: terminalSignal
      });

      const nextPlanning = await input.capabilityPlanning.planByWorkflowId({
        workflowId,
        recordedAt: replannedAt,
        policyId: advanceInput.policyId
      });

      return {
        kind: "executed",
        planning,
        command: persistedCommand,
        execution: {
          command: executionCommand,
          result: executionResult,
          startedSignal,
          terminalSignal
        },
        nextPlanning
      };
    }
  };
}

function requirePlannerCommand(
  planning: SymphonyCapabilityPlanningResult
): SymphonyCapabilityPlannerCommandRecord {
  if (planning.command === null) {
    throw new TypeError(
      `Capability execution requires a persisted command for execute plan ${planning.decision.decisionId}.`
    );
  }

  return planning.command;
}

function deriveExecutionAttemptContext(input: {
  workflowId: string;
  history: WorkflowHistory;
  capabilityId: SymphonyCapabilityId;
  workEpoch: number;
}): SymphonyCapabilityExecutionAttemptContext {
  const projection = projectWorkflowCapabilityProjection<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >({
    workflowId: input.workflowId,
    history: input.history
  });
  const latestAttempt = findLatestAttemptForCapability({
    projection,
    capabilityId: input.capabilityId,
    workEpoch: input.workEpoch
  });

  if (latestAttempt && isCapabilityAttemptActive(latestAttempt)) {
    throw new TypeError(
      `Capability execution cannot start ${JSON.stringify(input.capabilityId)} for work epoch ${input.workEpoch} while attempt ${latestAttempt.attempt} remains active.`
    );
  }

  return {
    workEpoch: input.workEpoch,
    attempt: latestAttempt ? latestAttempt.attempt + 1 : 1
  };
}

function findLatestAttemptForCapability(input: {
  projection: WorkflowCapabilityProjection<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  capabilityId: SymphonyCapabilityId;
  workEpoch: number;
}): WorkflowCapabilityAttempt<
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
> | null {
  const matchingAttempts = input.projection.capabilityStatusesByEpoch
    .flatMap((status) => status.attempts)
    .filter(
      (attempt) =>
        attempt.capabilityId === input.capabilityId &&
        attempt.workEpoch === input.workEpoch
    );

  if (matchingAttempts.length === 0) {
    return null;
  }

  return matchingAttempts.reduce((latest, current) =>
    current.attempt > latest.attempt ? current : latest
  );
}

function isCapabilityAttemptActive(
  attempt: WorkflowCapabilityAttempt<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >
) {
  return (
    attempt.status === "planned" ||
    attempt.status === "started" ||
    attempt.status === "clarification_requested"
  );
}

function createExecutionCommandWithContext(input: {
  command: SymphonyWorkflowCapabilityExecutionCommand;
  context: SymphonyCapabilityExecutionAttemptContext;
}): SymphonyWorkflowCapabilityExecutionCommand {
  return createSymphonyCapabilityExecutionCommand({
    id: input.command.id,
    dedupeKey: input.command.dedupeKey,
    workflowId: input.command.payload.workflowId,
    capabilityId: input.command.payload.capabilityId,
    modelProfileId: input.command.payload.modelProfileId,
    contract: input.command.payload.contract,
    executionInput: {
      ...(input.command.payload.executionInput ?? {}),
      workEpoch: input.context.workEpoch,
      attempt: input.context.attempt
    }
  });
}

function assertExecutionResultMatchesCommand(input: {
  command: SymphonyWorkflowCapabilityExecutionCommand;
  result: WorkflowCapabilityExecutionResult<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  context: SymphonyCapabilityExecutionAttemptContext;
}) {
  if (input.result.executionId !== input.command.id) {
    throw new TypeError(
      `Capability execution result for ${input.command.id} returned mismatched executionId ${JSON.stringify(input.result.executionId)}.`
    );
  }

  if (input.result.capabilityId !== input.command.payload.capabilityId) {
    throw new TypeError(
      `Capability execution result for ${input.command.id} returned mismatched capability ${JSON.stringify(input.result.capabilityId)}.`
    );
  }

  switch (input.result.kind) {
    case "clarification_requested":
      if (
        input.result.clarification.raisedByCapabilityId !==
        input.command.payload.capabilityId
      ) {
        throw new TypeError(
          `Capability clarification result for ${input.command.id} must raise clarification from ${JSON.stringify(input.command.payload.capabilityId)}.`
        );
      }
      if (input.result.clarification.workEpoch !== input.context.workEpoch) {
        throw new TypeError(
          `Capability clarification result for ${input.command.id} returned mismatched work epoch ${input.result.clarification.workEpoch}.`
        );
      }
      return;
    case "completed":
    case "changes_requested":
    case "failed":
    case "blocked":
      if (input.result.modelProfileId !== input.command.payload.modelProfileId) {
        throw new TypeError(
          `Capability execution result for ${input.command.id} returned mismatched model profile ${JSON.stringify(input.result.modelProfileId)}.`
        );
      }
      if (input.result.workEpoch !== input.context.workEpoch) {
        throw new TypeError(
          `Capability execution result for ${input.command.id} returned mismatched work epoch ${input.result.workEpoch}.`
        );
      }
      if (input.result.attempt !== input.context.attempt) {
        throw new TypeError(
          `Capability execution result for ${input.command.id} returned mismatched attempt ${input.result.attempt}.`
        );
      }
  }
}

function buildStartedSummary(capabilityId: SymphonyCapabilityId): string {
  return `Started ${capabilityId}.`;
}

function createTerminalSignal(input: {
  workflowId: string;
  recordedAt: string;
  result: WorkflowCapabilityExecutionResult<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  command: SymphonyWorkflowCapabilityExecutionCommand;
  correlationId: string;
}): WorkflowSignal {
  const baseSignalInput = {
    workflowId: input.workflowId,
    occurredAt: input.recordedAt,
    causationId: input.command.id,
    correlationId: input.correlationId
  };

  switch (input.result.kind) {
    case "completed":
      return createSymphonyCapabilityCompletedSignal({
        id: buildCapabilitySignalId({
          workflowId: input.workflowId,
          executionId: input.result.executionId,
          signalKind: "completed",
          recordedAt: input.recordedAt
        }),
        source: "runtime",
        executionId: input.result.executionId,
        capabilityId: input.result.capabilityId,
        modelProfileId: input.result.modelProfileId,
        workEpoch: input.result.workEpoch,
        attempt: input.result.attempt,
        summary: input.result.summary,
        evidenceProduced: input.result.evidenceProduced,
        ...baseSignalInput
      });
    case "changes_requested":
      return createSymphonyCapabilityChangesRequestedSignal({
        id: buildCapabilitySignalId({
          workflowId: input.workflowId,
          executionId: input.result.executionId,
          signalKind: "changes_requested",
          recordedAt: input.recordedAt
        }),
        source: "runtime",
        executionId: input.result.executionId,
        capabilityId: input.result.capabilityId,
        modelProfileId: input.result.modelProfileId,
        workEpoch: input.result.workEpoch,
        attempt: input.result.attempt,
        summary: input.result.summary,
        findings: input.result.findings,
        ...baseSignalInput
      });
    case "clarification_requested":
      return createSymphonyWorkflowClarificationRequestedSignal({
        id: buildCapabilitySignalId({
          workflowId: input.workflowId,
          executionId: input.result.executionId,
          signalKind: "clarification_requested",
          recordedAt: input.recordedAt
        }),
        source: "runtime",
        requestId: input.result.clarification.requestId,
        raisedByCapabilityId: input.result.clarification.raisedByCapabilityId,
        workEpoch: input.result.clarification.workEpoch,
        summary: input.result.clarification.summary,
        questions: input.result.clarification.questions,
        ...baseSignalInput
      });
    case "failed":
      return createSymphonyCapabilityFailedSignal({
        id: buildCapabilitySignalId({
          workflowId: input.workflowId,
          executionId: input.result.executionId,
          signalKind: "failed",
          recordedAt: input.recordedAt
        }),
        source: "runtime",
        executionId: input.result.executionId,
        capabilityId: input.result.capabilityId,
        modelProfileId: input.result.modelProfileId,
        workEpoch: input.result.workEpoch,
        attempt: input.result.attempt,
        summary: input.result.summary,
        retryable: input.result.retryable,
        reasonCode: input.result.reasonCode,
        failureKind: input.result.failureKind,
        ...baseSignalInput
      });
    case "blocked":
      return createSymphonyCapabilityBlockedSignal({
        id: buildCapabilitySignalId({
          workflowId: input.workflowId,
          executionId: input.result.executionId,
          signalKind: "blocked",
          recordedAt: input.recordedAt
        }),
        source: "runtime",
        executionId: input.result.executionId,
        capabilityId: input.result.capabilityId,
        modelProfileId: input.result.modelProfileId,
        workEpoch: input.result.workEpoch,
        attempt: input.result.attempt,
        summary: input.result.summary,
        reasonCode: input.result.reasonCode,
        ...baseSignalInput
      });
  }
}

async function recordSignal(input: {
  workflowId: string;
  routeWorkflows: SymphonyRouteWorkflowPort;
  sessionLoaderResult: NonNullable<
    Awaited<ReturnType<SymphonyRuntimeWorkflowSessionLoader["resumeByWorkflowId"]>>
  >;
  signal: WorkflowSignal;
}) {
  const result = await input.sessionLoaderResult.resumed.session.receiveAsync(
    input.signal
  );

  await input.routeWorkflows.recordRouteResult({
    workflowId: input.workflowId,
    policy: input.sessionLoaderResult.routing.policy,
    result
  });
}

function buildCapabilitySignalId(input: {
  workflowId: string;
  executionId: string;
  signalKind:
    | "started"
    | "completed"
    | "changes_requested"
    | "clarification_requested"
    | "failed"
    | "blocked";
  recordedAt: string;
}) {
  return [
    "signal",
    "capability",
    input.signalKind,
    normalizeWorkflowToken(input.workflowId),
    normalizeWorkflowToken(input.executionId),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}

function incrementIsoTimestamp(value: string, milliseconds: number): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new TypeError(`Invalid ISO timestamp ${JSON.stringify(value)}.`);
  }

  return new Date(timestamp + milliseconds).toISOString();
}

function requireNonEmptyText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}
