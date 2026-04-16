import type {
  SymphonyAgentRuntimeCompletion
} from "@symphony/orchestrator";
import {
  buildSymphonyIntelligentFlowAdmissibilitySnapshot,
  createSymphonyCapabilityPreset,
  createSymphonyIntelligentFlowDefaultModuleRegistry,
  createSymphonyWorkflowClarificationRequestedSignal,
  projectWorkflowCapabilityProjection,
  type SymphonyIntelligentFlowLifecycleState,
  type SymphonyIntelligentFlowModuleDefinition,
  type SymphonyIntelligentFlowModuleRegistry,
  type WorkflowCommand
} from "@symphony/router";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import {
  createRouteCommandSettlementSessionLoader,
  executeSettledTrackerTransitionCommand,
  normalizeWorkflowToken,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type {
  SymphonyRuntimeWorkflowSettlementSession
} from "./runtime-workflow-session-types.js";
import type {
  SymphonyRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import type {
  SymphonyRuntimeWorkflowPresetAdapter
} from "./runtime-workflow-preset-adapter.js";
import type {
  SymphonyCapabilityContractIntake
} from "./symphony-capability-contract-intake.js";
import {
  readSymphonyTicketIntakeDisposition,
  type SymphonyTicketIntakeClarificationRequest,
  type SymphonyTicketIntakeReason,
  renderSymphonyOperatorStateDirectiveComment
} from "./symphony-ticket-intake-contract.js";

const INTAKE_REVIEW_MODULE_ID = "intake.review";

export type SymphonyIntakeReviewModuleExecutionResult =
  | {
      kind: "not_needed";
    }
  | {
      kind: "completed";
      moduleId: "intake.review";
    }
  | {
      kind: "clarification_requested";
      moduleId: "intake.review";
      reasons: SymphonyTicketIntakeReason[];
      clarificationRequest: SymphonyTicketIntakeClarificationRequest;
    }
  | {
      kind: "failed";
      moduleId: "intake.review";
      reasons: SymphonyTicketIntakeReason[];
    };

export type SymphonyIntakeReviewModuleService = {
  executeIfNeeded(input: {
    workflowId: string;
    issue: SymphonyTrackerIssue;
    runMode: SymphonyRunMode;
    recordedAt: string;
    causationId: string | null;
  }): Promise<SymphonyIntakeReviewModuleExecutionResult>;
};

export function createSymphonyIntakeReviewModuleService(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  contractIntake: SymphonyCapabilityContractIntake;
  moduleRegistry?:
    | SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>
    | null;
}): SymphonyIntakeReviewModuleService {
  const moduleRegistry =
    input.moduleRegistry ?? createSymphonyIntelligentFlowDefaultModuleRegistry();

  return {
    async executeIfNeeded(executionInput) {
      const existing = await input.contractIntake.loadByWorkflowId(
        executionInput.workflowId
      );
      if (existing) {
        return {
          kind: "not_needed"
        };
      }

      const loaded = await input.sessionLoader.loadHydrationByWorkflowId({
        workflowId: executionInput.workflowId
      });
      if (!loaded) {
        throw new TypeError(
          `Intake review cannot load route workflow ${executionInput.workflowId}.`
        );
      }

      const lifecycleState = resolveIntakeLifecycleState({
        workflowId: executionInput.workflowId,
        currentNode: loaded.hydrationState.snapshot?.projection.currentNode ?? null
      });
      assertIntakeReviewIsAdmissible({
        workflowId: executionInput.workflowId,
        lifecycleState,
        moduleRegistry
      });

      const assessment = await input.contractIntake.assessForWorkflow({
        workflowId: executionInput.workflowId,
        issue: executionInput.issue,
        repositoryKey: loaded.hydrationState.workflow.repositoryKey,
        recordedAt: executionInput.recordedAt
      });

      switch (assessment.decision) {
        case "ready":
          await input.contractIntake.createAndPersistForWorkflow({
            workflowId: executionInput.workflowId,
            issue: executionInput.issue,
            repositoryKey: loaded.hydrationState.workflow.repositoryKey,
            recordedAt: executionInput.recordedAt
          });
          return {
            kind: "completed",
            moduleId: INTAKE_REVIEW_MODULE_ID
          };
        case "needs_clarification":
          await routeContractIntakeClarification({
            sessionLoader: input.sessionLoader,
            routeWorkflows: input.routeWorkflows,
            tracker: input.tracker,
            workflowId: executionInput.workflowId,
            issue: executionInput.issue,
            runMode: executionInput.runMode,
            recordedAt: executionInput.recordedAt,
            causationId: executionInput.causationId,
            clarificationRequest: assessment.clarificationRequest,
            reasons: assessment.reasons
          });
          return {
            kind: "clarification_requested",
            moduleId: INTAKE_REVIEW_MODULE_ID,
            reasons: assessment.reasons,
            clarificationRequest: assessment.clarificationRequest
          };
        case "invalid_directive":
          await routeContractIntakeFailure({
            sessionLoader: input.sessionLoader,
            routeWorkflows: input.routeWorkflows,
            tracker: input.tracker,
            workflowId: executionInput.workflowId,
            issue: executionInput.issue,
            runMode: executionInput.runMode,
            recordedAt: executionInput.recordedAt,
            causationId: executionInput.causationId,
            reasons: assessment.reasons
          });
          return {
            kind: "failed",
            moduleId: INTAKE_REVIEW_MODULE_ID,
            reasons: assessment.reasons
          };
      }
    }
  };
}

function resolveIntakeLifecycleState(input: {
  workflowId: string;
  currentNode: string | null;
}): SymphonyIntelligentFlowLifecycleState {
  switch (input.currentNode) {
    case "queued":
    case "claimed":
    case "active":
      return input.currentNode;
    default:
      throw new TypeError(
        `Intake review cannot run while workflow ${input.workflowId} is in lifecycle node ${JSON.stringify(input.currentNode)}.`
      );
  }
}

function assertIntakeReviewIsAdmissible(input: {
  workflowId: string;
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  moduleRegistry: SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>;
}) {
  const candidateSet = buildSymphonyIntelligentFlowAdmissibilitySnapshot({
    lifecycleState: input.lifecycleState,
    resolvedPolicy: createSymphonyCapabilityPreset({
      policyId: "default"
    }).defaultPolicy,
    projection: projectWorkflowCapabilityProjection({
      workflowId: input.workflowId,
      history: []
    }),
    moduleRegistry: input.moduleRegistry,
    executionContractAvailable: false
  });
  const selected = candidateSet.admissible[0] ?? null;
  if (selected?.moduleId === INTAKE_REVIEW_MODULE_ID) {
    return;
  }

  throw new TypeError(
    `Intake review could not select ${JSON.stringify(INTAKE_REVIEW_MODULE_ID)} for workflow ${JSON.stringify(input.workflowId)}.`
  );
}

async function routeContractIntakeFailure(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  workflowId: string;
  issue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode;
  recordedAt: string;
  causationId: string | null;
  reasons: SymphonyTicketIntakeReason[];
}) {
  const loaded = await input.sessionLoader.resumeByWorkflowId({
    workflowId: input.workflowId
  });
  if (!loaded) {
    throw new TypeError(
      `Intake review cannot resume route workflow ${input.workflowId} after invalid directives were detected.`
    );
  }

  const result = await loaded.resumed.session.receiveAsync(
    loaded.routing.module.runtimeAdapter.createRuntimeCompletionSignal({
      id: buildContractIntakeFailureSignalId({
        workflowId: input.workflowId,
        runMode: input.runMode,
        recordedAt: input.recordedAt
      }),
      occurredAt: input.recordedAt,
      runId: null,
      runMode: input.runMode,
      completion: buildContractIntakeStartupFailure({
        reasons: input.reasons
      }),
      causationId: input.causationId,
      correlationId: input.issue.identifier
    })
  );

  await input.routeWorkflows.recordRouteResult({
    workflowId: input.workflowId,
    policy: loaded.routing.policy,
    result
  });

  await settleFailureCommands({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    workflowId: input.workflowId,
    issue: input.issue,
    session: loaded.resumed.session,
    loadSettlementSession: createRouteCommandSettlementSessionLoader({
      sessionLoader: input.sessionLoader,
      workflowId: input.workflowId,
      failureContext:
        "while settling intake.review startup-failure route commands"
    }),
    recordedAt: input.recordedAt,
    presetAdapter: loaded.routing.module.runtimeAdapter,
    commands: result.decision.commands
  });

  await leaveContractIntakeFailureComment({
    tracker: input.tracker,
    issue: input.issue,
    reasons: input.reasons
  });
}

function buildContractIntakeStartupFailure(
  input: {
    reasons: SymphonyTicketIntakeReason[];
  }
): Extract<SymphonyAgentRuntimeCompletion, { kind: "startup_failure" }> {
  return {
    kind: "startup_failure",
    reason: `Intake review failed: ${readPrimaryReasonMessage(input.reasons)}`,
    failureStage: "workspace_before_run",
    failureOrigin: "capability_contract_intake"
  };
}

async function leaveContractIntakeFailureComment(input: {
  tracker: SymphonyTracker;
  issue: Pick<SymphonyTrackerIssue, "id">;
  reasons: SymphonyTicketIntakeReason[];
}) {
  try {
    await input.tracker.createComment(
      input.issue.id,
      buildContractIntakeFailureCommentBody(input.reasons)
    );
  } catch {
    return;
  }
}

function buildContractIntakeFailureCommentBody(
  reasons: SymphonyTicketIntakeReason[]
): string {
  const disposition = readSymphonyTicketIntakeDisposition("invalid_directive");
  const trackerState =
    disposition.trackerState ??
    (() => {
      throw new TypeError(
        "Invalid directive intake disposition must resolve to a tracker state."
      );
    })();

  return renderSymphonyOperatorStateDirectiveComment({
    title: "Symphony intake.review failed before execution.",
    state: trackerState,
    whatChanged:
      "Symphony stopped during intake.review because the ticket body or routing directives could not be normalized into a valid execution contract.",
    reasons,
    nextAction:
      "Update the ticket body or routing directives so intake.review can derive a valid execution contract.",
    requeueToState: disposition.requeueToState
  });
}

async function routeContractIntakeClarification(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  workflowId: string;
  issue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode;
  recordedAt: string;
  causationId: string | null;
  clarificationRequest: SymphonyTicketIntakeClarificationRequest;
  reasons: SymphonyTicketIntakeReason[];
}) {
  const loaded = await input.sessionLoader.resumeByWorkflowId({
    workflowId: input.workflowId
  });
  if (!loaded) {
    throw new TypeError(
      `Intake review cannot resume route workflow ${input.workflowId} after clarification was requested.`
    );
  }

  const result = await loaded.resumed.session.receiveAsync(
    createSymphonyWorkflowClarificationRequestedSignal({
      id: buildContractIntakeClarificationSignalId({
        workflowId: input.workflowId,
        runMode: input.runMode,
        recordedAt: input.recordedAt
      }),
      occurredAt: input.recordedAt,
      source: "router",
      workflowId: input.workflowId,
      requestId: buildContractIntakeClarificationRequestId(input.workflowId),
      raisedByCapabilityId: null,
      workEpoch: 0,
      summary: input.clarificationRequest.summary,
      questions: input.clarificationRequest.questions,
      causationId: input.causationId,
      correlationId: input.issue.identifier
    })
  );

  await input.routeWorkflows.recordRouteResult({
    workflowId: input.workflowId,
    policy: loaded.routing.policy,
    result
  });

  if (result.decision.commands.length > 0) {
    throw new TypeError(
      "Intake review clarification routing must not emit route commands."
    );
  }

  await input.tracker.updateIssueState(
    input.issue.id,
    "Paused"
  );

  await leaveContractIntakeClarificationComment({
    tracker: input.tracker,
    issue: input.issue,
    clarificationRequest: input.clarificationRequest,
    reasons: input.reasons
  });
}

async function leaveContractIntakeClarificationComment(input: {
  tracker: SymphonyTracker;
  issue: Pick<SymphonyTrackerIssue, "id">;
  clarificationRequest: SymphonyTicketIntakeClarificationRequest;
  reasons: SymphonyTicketIntakeReason[];
}) {
  try {
    await input.tracker.createComment(
      input.issue.id,
      buildContractIntakeClarificationCommentBody({
        clarificationRequest: input.clarificationRequest,
        reasons: input.reasons
      })
    );
  } catch {
    return;
  }
}

function buildContractIntakeClarificationCommentBody(input: {
  clarificationRequest: SymphonyTicketIntakeClarificationRequest;
  reasons: SymphonyTicketIntakeReason[];
}): string {
  const disposition = readSymphonyTicketIntakeDisposition("needs_clarification");
  const trackerState =
    disposition.trackerState ??
    (() => {
      throw new TypeError(
        "Needs-clarification intake disposition must resolve to a tracker state."
      );
    })();

  const quotedQuestions = input.clarificationRequest.questions
    .map((question) => `"${question.prompt}"`)
    .join(" ");

  return renderSymphonyOperatorStateDirectiveComment({
    title: "Symphony intake.review paused before execution.",
    state: trackerState,
    whatChanged:
      "Symphony paused during intake.review because the ticket needs more detail before it can derive a valid execution contract.",
    reasons: input.reasons,
    nextAction:
      input.clarificationRequest.questions.length === 0
        ? "Update the ticket body with the missing implementation detail so intake.review can derive a valid execution contract."
        : `Update the ticket body to answer the missing question${input.clarificationRequest.questions.length === 1 ? "" : "s"}: ${quotedQuestions}`,
    requeueToState: disposition.requeueToState
  });
}

async function settleFailureCommands(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  workflowId: string;
  issue: SymphonyTrackerIssue;
  session: SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>;
  loadSettlementSession: () => Promise<
    SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>
  >;
  recordedAt: string;
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  commands: WorkflowCommand[];
}) {
  let currentIssue = input.issue;

  for (const command of input.commands) {
    if (command.kind !== "tracker.transition") {
      throw new TypeError(
        `Intake review does not support command kind ${command.kind} while routing startup failures.`
      );
    }

    currentIssue = await executeSettledTrackerTransitionCommand({
      routeWorkflows: input.routeWorkflows,
      workflowId: input.workflowId,
      session: input.session,
      loadSettlementSession: input.loadSettlementSession,
      command,
      recordedAt: input.recordedAt,
      issue: currentIssue,
      tracker: input.tracker,
      readTargetState(executedCommand) {
        return readTrackerTransitionState({
          adapter: input.presetAdapter,
          command: executedCommand
        });
      }
    });
  }
}

function buildContractIntakeFailureSignalId(input: {
  workflowId: string;
  runMode: string;
  recordedAt: string;
}) {
  return [
    "signal",
    "contract_intake_failed",
    normalizeWorkflowToken(input.workflowId),
    normalizeWorkflowToken(input.runMode),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}

function buildContractIntakeClarificationSignalId(input: {
  workflowId: string;
  runMode: string;
  recordedAt: string;
}) {
  return [
    "signal",
    "contract_intake_clarification_requested",
    normalizeWorkflowToken(input.workflowId),
    normalizeWorkflowToken(input.runMode),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}

function buildContractIntakeClarificationRequestId(workflowId: string) {
  return `contract_intake_${normalizeWorkflowToken(workflowId)}`;
}

function readPrimaryReasonMessage(reasons: SymphonyTicketIntakeReason[]) {
  return (
    reasons[0]?.message ??
    "Ticket intake could not derive a valid execution contract."
  );
}
