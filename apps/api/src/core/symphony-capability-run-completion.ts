import type { RouteWorkflowStore } from "@symphony/db";
import type { SymphonyAgentRuntimeCompletion } from "@symphony/orchestrator";
import type {
  SymphonyImplementationModuleResult,
  SymphonyRunMode
} from "@symphony/runtime-contract";
import {
  createSymphonyCapabilityBlockedSignal,
  createSymphonyCapabilityStartedSignal,
  createSymphonyCapabilityCompletedSignal,
  createSymphonyCapabilityFailedSignal,
  createSymphonyWorkflowClarificationRequestedSignal,
  projectWorkflowCapabilityProjection,
  type SymphonyCapabilityEvidenceId,
  type SymphonyCapabilityId,
  type SymphonyCapabilityModelProfileId,
  type WorkflowCapabilityAttempt,
  type WorkflowCapabilityProjection,
  type WorkflowHistory,
  type WorkflowSignal
} from "@symphony/router";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type {
  SymphonyRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import {
  normalizeWorkflowToken
} from "./runtime-route-workflow-command-utils.js";
import type {
  SymphonyCapabilityPlanningResult,
  SymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";

const capabilityManagedRunModes = new Set<SymphonyRunMode>(["implementation"]);

export type SymphonyCapabilityRunCompletionResult =
  | {
      kind: "not_handled";
    }
  | {
      kind: "continued";
      nextPlanning: SymphonyCapabilityPlanningResult;
      continueWithRunMode: SymphonyRunMode;
    }
  | {
      kind: "ready_for_completion";
      nextPlanning: SymphonyCapabilityPlanningResult;
    }
  | {
      kind: "awaiting_input";
      nextPlanning: SymphonyCapabilityPlanningResult;
    }
  | {
      kind: "blocked";
      nextPlanning: SymphonyCapabilityPlanningResult;
    }
  | {
      kind: "failure_recorded";
      nextPlanning: SymphonyCapabilityPlanningResult;
    };

export type SymphonyCapabilityRunCompletionService = {
  handleRunCompletion(input: {
    issueIdentifier: string;
    runMode: SymphonyRunMode;
    completion: SymphonyAgentRuntimeCompletion;
    recordedAt: string;
  }): Promise<SymphonyCapabilityRunCompletionResult>;
};

export function createSymphonyCapabilityRunCompletionService(input: {
  routeWorkflowStore: RouteWorkflowStore;
  routeWorkflows: SymphonyRouteWorkflowPort;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  capabilityPlanning: SymphonyCapabilityPlanningService;
}): SymphonyCapabilityRunCompletionService {
  return {
    async handleRunCompletion(completionInput) {
      if (!capabilityManagedRunModes.has(completionInput.runMode)) {
        return {
          kind: "not_handled"
        };
      }

      const loaded = await input.sessionLoader.resumeByIssueIdentifier({
        issueIdentifier: completionInput.issueIdentifier
      });
      if (!loaded) {
        return {
          kind: "not_handled"
        };
      }

      const workflowId = loaded.resumed.hydrationState.workflow.workflowId;
      let planning: SymphonyCapabilityPlanningResult;
      try {
        planning = await input.capabilityPlanning.planByWorkflowId({
          workflowId,
          recordedAt: completionInput.recordedAt
        });
      } catch {
        return {
          kind: "not_handled"
        };
      }

      if (planning.plan.kind !== "execute" || planning.command === null) {
        return {
          kind: "not_handled"
        };
      }

      const history = await input.routeWorkflowStore.listHistory(workflowId);
      const attemptContext = deriveCapabilityRunAttemptContext({
        workflowId,
        history: history.map((entry) => entry.event),
        executionId: planning.command.command.id,
        capabilityId: planning.plan.decision.capabilityId,
        modelProfileId: planning.plan.decision.modelProfileId,
        workEpoch: planning.plan.decision.workEpoch
      });
      const startedAt = completionInput.recordedAt;
      const terminalAt = attemptContext.recordStarted
        ? incrementIsoTimestamp(completionInput.recordedAt, 1)
        : completionInput.recordedAt;
      const replannedAt = incrementIsoTimestamp(terminalAt, 1);

      if (attemptContext.recordStarted) {
        await recordSignal({
          workflowId,
          routeWorkflows: input.routeWorkflows,
          sessionLoaderResult: loaded,
          signal: createSymphonyCapabilityStartedSignal({
            id: buildCapabilitySignalId({
              workflowId,
              executionId: planning.command.command.id,
              signalKind: "started",
              recordedAt: startedAt
            }),
            occurredAt: startedAt,
            source: "runtime",
            workflowId,
            executionId: planning.command.command.id,
            capabilityId: planning.plan.decision.capabilityId,
            modelProfileId: planning.plan.decision.modelProfileId,
            workEpoch: planning.plan.decision.workEpoch,
            attempt: attemptContext.attempt,
            summary: buildStartedSummary(planning.plan.decision.capabilityId),
            causationId: planning.command.command.id,
            correlationId: planning.contract.issueIdentifier
          })
        });
      }

      await recordSignal({
        workflowId,
        routeWorkflows: input.routeWorkflows,
        sessionLoaderResult: loaded,
        signal: createTerminalSignal({
          workflowId,
          recordedAt: terminalAt,
          planning,
          attempt: attemptContext.attempt,
          completion: completionInput.completion
        })
      });

      const nextPlanning = await input.capabilityPlanning.planByWorkflowId({
        workflowId,
        recordedAt: replannedAt
      });

      switch (completionInput.completion.kind) {
        case "delivered":
          switch (nextPlanning.plan.kind) {
            case "execute":
              return {
                kind: "continued",
                nextPlanning,
                continueWithRunMode: completionInput.runMode
              };
            case "ready_for_completion":
              return {
                kind: "ready_for_completion",
                nextPlanning
              };
            case "awaiting_input":
              return {
                kind: "awaiting_input",
                nextPlanning
              };
            case "blocked":
              return {
                kind: "blocked",
                nextPlanning
              };
          }
          return {
            kind: "failure_recorded",
            nextPlanning
          };
        case "awaiting_input":
          return {
            kind: "awaiting_input",
            nextPlanning
          };
        case "blocked":
          return {
            kind: "blocked",
            nextPlanning
          };
        default:
          return {
            kind: "failure_recorded",
            nextPlanning
          };
      }
    }
  };
}

type CapabilityRunAttemptContext = {
  attempt: number;
  recordStarted: boolean;
};

function deriveCapabilityRunAttemptContext(input: {
  workflowId: string;
  history: WorkflowHistory;
  executionId: string;
  capabilityId: SymphonyCapabilityId;
  modelProfileId: SymphonyCapabilityModelProfileId;
  workEpoch: number;
}): CapabilityRunAttemptContext {
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

  if (!latestAttempt) {
    return {
      attempt: 1,
      recordStarted: true
    };
  }

  if (isCapabilityAttemptActive(latestAttempt)) {
    if (
      latestAttempt.executionId !== input.executionId ||
      latestAttempt.modelProfileId !== input.modelProfileId
    ) {
      throw new TypeError(
        `Capability run completion received mismatched active execution ${JSON.stringify(input.executionId)} for ${input.capabilityId} work epoch ${input.workEpoch}.`
      );
    }

    return {
      attempt: latestAttempt.attempt,
      recordStarted: false
    };
  }

  return {
    attempt: latestAttempt.attempt + 1,
    recordStarted: true
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
  return attempt.status === "planned" || attempt.status === "started";
}

function mapEvidenceId(
  capabilityId: SymphonyCapabilityId
): SymphonyCapabilityEvidenceId {
  switch (capabilityId) {
    case "implement.spec":
      return "change_set";
    case "critic.code_review":
      return "code_review_report";
    case "critic.adversarial_tests":
      return "adversarial_test_report";
  }

  throw new TypeError(
    `Capability run completion cannot map evidence for ${JSON.stringify(capabilityId)}.`
  );
}

function buildStartedSummary(capabilityId: SymphonyCapabilityId): string {
  return `Started ${capabilityId}.`;
}

function buildFailureSummary(input: {
  capabilityId: SymphonyCapabilityId;
  completion: SymphonyAgentRuntimeCompletion;
}): string {
  return `${input.capabilityId} ended with runtime completion ${input.completion.kind}.`;
}

function isRetryableRuntimeFailure(
  completion: SymphonyAgentRuntimeCompletion
): boolean {
  switch (completion.kind) {
    case "provider_transient":
    case "rate_limited":
    case "stalled":
      return true;
    default:
      return false;
  }
}

function createTerminalSignal(input: {
  workflowId: string;
  recordedAt: string;
  planning: SymphonyCapabilityPlanningResult;
  attempt: number;
  completion: SymphonyAgentRuntimeCompletion;
}): WorkflowSignal {
  const decision = input.planning.plan.kind === "execute"
    ? input.planning.plan.decision
    : (() => {
        throw new TypeError("Capability terminal signal requires an execute plan.");
      })();
  const command =
    input.planning.command?.command ??
    (() => {
      throw new TypeError("Capability terminal signal requires a persisted command.");
    })();

  if (input.completion.kind === "delivered") {
    const moduleResult = input.completion.moduleResult ?? null;
    return createSymphonyCapabilityCompletedSignal({
      id: buildCapabilitySignalId({
        workflowId: input.workflowId,
        executionId: command.id,
        signalKind: "completed",
        recordedAt: input.recordedAt
      }),
      occurredAt: input.recordedAt,
      source: "runtime",
      workflowId: input.workflowId,
      executionId: command.id,
      capabilityId: decision.capabilityId,
      modelProfileId: decision.modelProfileId,
      workEpoch: decision.workEpoch,
      attempt: input.attempt,
      summary:
        moduleResult?.summary ?? `Completed ${decision.capabilityId}.`,
      evidenceProduced: [
        {
          evidenceId: mapEvidenceId(decision.capabilityId),
          summary: buildEvidenceSummary({
            capabilityId: decision.capabilityId,
            moduleResult
          }),
          artifacts: buildEvidenceArtifacts(moduleResult)
        }
      ],
      causationId: command.id,
      correlationId: input.planning.contract.issueIdentifier
    });
  }

  if (input.completion.kind === "awaiting_input") {
    const moduleResult = input.completion.moduleResult;
    return createSymphonyWorkflowClarificationRequestedSignal({
      id: buildCapabilitySignalId({
        workflowId: input.workflowId,
        executionId: command.id,
        signalKind: "clarification_requested",
        recordedAt: input.recordedAt
      }),
      occurredAt: input.recordedAt,
      source: "runtime",
      workflowId: input.workflowId,
      requestId: `clarification_${normalizeWorkflowToken(command.id)}`,
      raisedByCapabilityId: decision.capabilityId,
      workEpoch: decision.workEpoch,
      summary: moduleResult.summary,
      questions: [
        {
          id: "required_input",
          prompt: input.completion.prompt,
          context: moduleResult.evidence.notes
        }
      ],
      causationId: command.id,
      correlationId: input.planning.contract.issueIdentifier
    });
  }

  if (input.completion.kind === "blocked") {
    return createSymphonyCapabilityBlockedSignal({
      id: buildCapabilitySignalId({
        workflowId: input.workflowId,
        executionId: command.id,
        signalKind: "blocked",
        recordedAt: input.recordedAt
      }),
      occurredAt: input.recordedAt,
      source: "runtime",
      workflowId: input.workflowId,
      executionId: command.id,
      capabilityId: decision.capabilityId,
      modelProfileId: decision.modelProfileId,
      workEpoch: decision.workEpoch,
      attempt: input.attempt,
      summary:
        input.completion.moduleResult?.summary ??
        `Blocked ${decision.capabilityId}.`,
      reasonCode: "runtime_module_blocked",
      causationId: command.id,
      correlationId: input.planning.contract.issueIdentifier
    });
  }

  return createSymphonyCapabilityFailedSignal({
    id: buildCapabilitySignalId({
      workflowId: input.workflowId,
      executionId: command.id,
      signalKind: "failed",
      recordedAt: input.recordedAt
    }),
    occurredAt: input.recordedAt,
    source: "runtime",
    workflowId: input.workflowId,
    executionId: command.id,
    capabilityId: decision.capabilityId,
    modelProfileId: decision.modelProfileId,
    workEpoch: decision.workEpoch,
    attempt: input.attempt,
    summary: buildFailureSummary({
      capabilityId: decision.capabilityId,
      completion: input.completion
    }),
    retryable: isRetryableRuntimeFailure(input.completion),
    reasonCode: `runtime_${input.completion.kind}`,
    failureKind: isRetryableRuntimeFailure(input.completion)
      ? "transient"
      : "permanent",
    causationId: command.id,
    correlationId: input.planning.contract.issueIdentifier
  });
}

function buildCapabilitySignalId(input: {
  workflowId: string;
  executionId: string;
  signalKind:
    | "started"
    | "completed"
    | "failed"
    | "blocked"
    | "clarification_requested";
  recordedAt: string;
}) {
  return [
    "signal",
    input.signalKind,
    normalizeWorkflowToken(input.workflowId),
    normalizeWorkflowToken(input.executionId),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}

function buildEvidenceSummary(input: {
  capabilityId: SymphonyCapabilityId;
  moduleResult: SymphonyImplementationModuleResult | null;
}): string {
  const notes = input.moduleResult?.evidence.notes?.trim() ?? "";
  if (notes !== "") {
    return notes;
  }

  switch (input.capabilityId) {
    case "implement.spec":
      return "Produced the implementation change set.";
    case "critic.code_review":
      return "Produced the code review report.";
    case "critic.adversarial_tests":
      return "Produced the adversarial test report.";
  }

  throw new TypeError(
    `Capability run completion is missing an evidence summary for ${JSON.stringify(input.capabilityId)}.`
  );
}

function buildEvidenceArtifacts(
  moduleResult: SymphonyImplementationModuleResult | null
) {
  if (!moduleResult) {
    return [];
  }

  return [
    ...moduleResult.evidence.filesChanged.map((path: string) => ({
      label: `file:${path}`,
      uri: null
    })),
    ...moduleResult.evidence.verification.map((verification) => ({
      label: `${verification.status}:${verification.command}`,
      uri: null
    }))
  ];
}

async function recordSignal(input: {
  workflowId: string;
  routeWorkflows: SymphonyRouteWorkflowPort;
  sessionLoaderResult: NonNullable<
    Awaited<ReturnType<SymphonyRuntimeWorkflowSessionLoader["resumeByIssueIdentifier"]>>
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

function incrementIsoTimestamp(value: string, milliseconds: number): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new TypeError(`Invalid ISO timestamp ${JSON.stringify(value)}.`);
  }

  return new Date(timestamp + milliseconds).toISOString();
}
