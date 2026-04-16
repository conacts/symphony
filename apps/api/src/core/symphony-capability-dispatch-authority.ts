import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyDispatchHandling
} from "@symphony/orchestrator";
import {
  createSymphonyWorkflowClarificationRequestedSignal,
  type WorkflowCommand
} from "@symphony/router";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  type SymphonyTracker,
  type SymphonyTrackerIssue
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
import type { SymphonyTrackerStateDispatchRequest } from "./runtime-tracker-state-observation-routing.js";
import type {
  SymphonyRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import type {
  SymphonyRuntimeWorkflowPresetAdapter
} from "./runtime-workflow-preset-adapter.js";
import type {
  SymphonyCapabilityContractIntake
} from "./symphony-capability-contract-intake.js";
import type {
  SymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";
import {
  readSymphonyTicketIntakeDisposition,
  type SymphonyTicketIntakeClarificationRequest,
  type SymphonyTicketIntakeReason,
  renderSymphonyOperatorStateDirectiveComment
} from "./symphony-ticket-intake-contract.js";

const capabilityManagedRunModes = new Set<SymphonyRunMode>(["implementation"]);

export type SymphonyCapabilityDispatchAuthorityService = {
  handleDispatchRequest(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<SymphonyDispatchHandling>;
};

export function createSymphonyCapabilityDispatchAuthorityService(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  contractIntake: SymphonyCapabilityContractIntake;
  capabilityPlanning: SymphonyCapabilityPlanningService;
}): SymphonyCapabilityDispatchAuthorityService {
  return {
    async handleDispatchRequest(dispatchInput) {
      if (!capabilityManagedRunModes.has(dispatchInput.runMode)) {
        return "external_run";
      }

      const contractResolution = await ensureExecutionContract({
        sessionLoader: input.sessionLoader,
        contractIntake: input.contractIntake,
        workflowId: dispatchInput.workflowId,
        issue: dispatchInput.trackerIssue,
        recordedAt: dispatchInput.recordedAt
      });

      switch (contractResolution.kind) {
        case "ready":
          break;
        case "needs_clarification":
          await routeContractIntakeClarification({
            sessionLoader: input.sessionLoader,
            routeWorkflows: input.routeWorkflows,
            tracker: input.tracker,
            dispatchRequest: dispatchInput,
            clarificationRequest: contractResolution.clarificationRequest,
            reasons: contractResolution.reasons
          });
          return "handled_in_process";
        case "invalid_directive":
          await routeContractIntakeFailure({
            sessionLoader: input.sessionLoader,
            routeWorkflows: input.routeWorkflows,
            tracker: input.tracker,
            dispatchRequest: dispatchInput,
            reasons: contractResolution.reasons
          });
          return "handled_in_process";
      }

      const planning = await input.capabilityPlanning.planByWorkflowId({
        workflowId: dispatchInput.workflowId,
        recordedAt: dispatchInput.recordedAt
      });

      if (planning.plan.kind !== "execute") {
        return "handled_in_process";
      }

      return "external_run";
    }
  };
}

async function ensureExecutionContract(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  contractIntake: SymphonyCapabilityContractIntake;
  workflowId: string;
  issue: Pick<SymphonyTrackerIssue, "identifier" | "title" | "description">;
  recordedAt: string;
}): Promise<
  | {
      kind: "ready";
    }
  | {
      kind: "needs_clarification";
      reasons: SymphonyTicketIntakeReason[];
      clarificationRequest: SymphonyTicketIntakeClarificationRequest;
    }
  | {
      kind: "invalid_directive";
      reasons: SymphonyTicketIntakeReason[];
    }
> {
  const existing = await input.contractIntake.loadByWorkflowId(input.workflowId);
  if (existing) {
    return {
      kind: "ready"
    };
  }

  const loaded = await input.sessionLoader.loadHydrationByWorkflowId({
    workflowId: input.workflowId
  });
  if (!loaded) {
    throw new TypeError(
      `Capability dispatch authority cannot load route workflow ${input.workflowId}.`
    );
  }

  const assessment = await input.contractIntake.assessForWorkflow({
    workflowId: input.workflowId,
    issue: input.issue,
    repositoryKey: loaded.hydrationState.workflow.repositoryKey,
    recordedAt: input.recordedAt
  });

  switch (assessment.decision) {
    case "ready":
      await input.contractIntake.createAndPersistForWorkflow({
        workflowId: input.workflowId,
        issue: input.issue,
        repositoryKey: loaded.hydrationState.workflow.repositoryKey,
        recordedAt: input.recordedAt
      });
      return {
        kind: "ready"
      };
    case "needs_clarification":
      return {
        kind: "needs_clarification",
        reasons: assessment.reasons,
        clarificationRequest: assessment.clarificationRequest
      };
    case "invalid_directive":
      return {
        kind: "invalid_directive",
        reasons: assessment.reasons
      };
  }
}

async function routeContractIntakeFailure(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  dispatchRequest: SymphonyTrackerStateDispatchRequest;
  reasons: SymphonyTicketIntakeReason[];
}) {
  const loaded = await input.sessionLoader.resumeByWorkflowId({
    workflowId: input.dispatchRequest.workflowId
  });
  if (!loaded) {
    throw new TypeError(
      `Capability dispatch authority cannot resume route workflow ${input.dispatchRequest.workflowId} after contract intake failed.`
    );
  }

  const result = await loaded.resumed.session.receiveAsync(
    loaded.routing.module.runtimeAdapter.createRuntimeCompletionSignal({
      id: buildContractIntakeFailureSignalId({
        workflowId: input.dispatchRequest.workflowId,
        runMode: input.dispatchRequest.runMode,
        recordedAt: input.dispatchRequest.recordedAt
      }),
      occurredAt: input.dispatchRequest.recordedAt,
      runId: null,
      runMode: input.dispatchRequest.runMode,
      completion: buildContractIntakeStartupFailure({
        reasons: input.reasons
      }),
      causationId: input.dispatchRequest.commandId,
      correlationId: input.dispatchRequest.trackerIssue.identifier
    })
  );

  await input.routeWorkflows.recordRouteResult({
    workflowId: input.dispatchRequest.workflowId,
    policy: loaded.routing.policy,
    result
  });

  await settleFailureCommands({
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    workflowId: input.dispatchRequest.workflowId,
    issue: input.dispatchRequest.trackerIssue,
    session: loaded.resumed.session,
    loadSettlementSession: createRouteCommandSettlementSessionLoader({
      sessionLoader: input.sessionLoader,
      workflowId: input.dispatchRequest.workflowId,
      failureContext:
        "while settling contract-intake startup-failure route commands"
    }),
    recordedAt: input.dispatchRequest.recordedAt,
    presetAdapter: loaded.routing.module.runtimeAdapter,
    commands: result.decision.commands
  });

  await leaveContractIntakeFailureComment({
    tracker: input.tracker,
    issue: input.dispatchRequest.trackerIssue,
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
    reason: `Capability contract intake failed: ${readPrimaryReasonMessage(input.reasons)}`,
    failureStage: "workspace_before_run",
    failureOrigin: "capability_contract_intake"
  };
}

async function leaveContractIntakeFailureComment(input: {
  tracker: SymphonyTracker;
  issue: SymphonyTrackerIssue;
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
    title: "Symphony capability routing failed before execution.",
    state: trackerState,
    whatChanged:
      "Symphony stopped before starting implementation because the ticket body or routing directives could not be normalized into a valid execution contract.",
    reasons,
    nextAction:
      "Update the ticket body or routing directives so Symphony can derive a valid execution contract.",
    requeueToState: disposition.requeueToState
  });
}

async function routeContractIntakeClarification(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  dispatchRequest: SymphonyTrackerStateDispatchRequest;
  clarificationRequest: SymphonyTicketIntakeClarificationRequest;
  reasons: SymphonyTicketIntakeReason[];
}) {
  const loaded = await input.sessionLoader.resumeByWorkflowId({
    workflowId: input.dispatchRequest.workflowId
  });
  if (!loaded) {
    throw new TypeError(
      `Capability dispatch authority cannot resume route workflow ${input.dispatchRequest.workflowId} after contract intake requested clarification.`
    );
  }

  const result = await loaded.resumed.session.receiveAsync(
    createSymphonyWorkflowClarificationRequestedSignal({
      id: buildContractIntakeClarificationSignalId({
        workflowId: input.dispatchRequest.workflowId,
        runMode: input.dispatchRequest.runMode,
        recordedAt: input.dispatchRequest.recordedAt
      }),
      occurredAt: input.dispatchRequest.recordedAt,
      source: "router",
      workflowId: input.dispatchRequest.workflowId,
      requestId: buildContractIntakeClarificationRequestId(
        input.dispatchRequest.workflowId
      ),
      raisedByCapabilityId: null,
      workEpoch: 0,
      summary: input.clarificationRequest.summary,
      questions: input.clarificationRequest.questions,
      causationId: input.dispatchRequest.commandId,
      correlationId: input.dispatchRequest.trackerIssue.identifier
    })
  );

  await input.routeWorkflows.recordRouteResult({
    workflowId: input.dispatchRequest.workflowId,
    policy: loaded.routing.policy,
    result
  });

  if (result.decision.commands.length > 0) {
    throw new TypeError(
      "Contract intake clarification routing must not emit route commands."
    );
  }

  await input.tracker.updateIssueState(
    input.dispatchRequest.trackerIssue.id,
    "Paused"
  );

  await leaveContractIntakeClarificationComment({
    tracker: input.tracker,
    issue: input.dispatchRequest.trackerIssue,
    clarificationRequest: input.clarificationRequest,
    reasons: input.reasons
  });
}

async function leaveContractIntakeClarificationComment(input: {
  tracker: SymphonyTracker;
  issue: SymphonyTrackerIssue;
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
    title: "Symphony capability routing paused before execution.",
    state: trackerState,
    whatChanged:
      "Symphony paused before starting implementation because the ticket needs more detail before it can derive a valid execution contract.",
    reasons: input.reasons,
    nextAction:
      input.clarificationRequest.questions.length === 0
        ? "Update the ticket body with the missing implementation detail so Symphony can derive a valid execution contract."
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
        `Capability dispatch authority does not support command kind ${command.kind} while routing contract intake failures.`
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
