import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyDispatchHandling
} from "@symphony/orchestrator";
import type { WorkflowCommand } from "@symphony/router";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  type SymphonyTracker,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import {
  createRouteCommandSettlementSessionLoader,
  executeSettledRouteCommand,
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
  SymphonyCapabilityContractIntakeValidationError,
  SymphonyCapabilityContractIntake
} from "./symphony-capability-contract-intake.js";
import type {
  SymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";
import {
  isSymphonyCapabilityContractIntakeValidationError
} from "./symphony-capability-contract-intake.js";

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

      try {
        await ensureExecutionContract({
          sessionLoader: input.sessionLoader,
          contractIntake: input.contractIntake,
          workflowId: dispatchInput.workflowId,
          issue: dispatchInput.trackerIssue,
          recordedAt: dispatchInput.recordedAt
        });
      } catch (error) {
        if (!isSymphonyCapabilityContractIntakeValidationError(error)) {
          throw error;
        }

        await routeContractIntakeFailure({
          sessionLoader: input.sessionLoader,
          routeWorkflows: input.routeWorkflows,
          tracker: input.tracker,
          dispatchRequest: dispatchInput,
          error
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
}) {
  const existing = await input.contractIntake.loadByWorkflowId(input.workflowId);
  if (existing) {
    return existing;
  }

  const loaded = await input.sessionLoader.loadHydrationByWorkflowId({
    workflowId: input.workflowId
  });
  if (!loaded) {
    throw new TypeError(
      `Capability dispatch authority cannot load route workflow ${input.workflowId}.`
    );
  }

  return await input.contractIntake.createAndPersistForWorkflow({
    workflowId: input.workflowId,
    issue: input.issue,
    repositoryKey: loaded.hydrationState.workflow.repositoryKey,
    recordedAt: input.recordedAt
  });
}

async function routeContractIntakeFailure(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  dispatchRequest: SymphonyTrackerStateDispatchRequest;
  error: SymphonyCapabilityContractIntakeValidationError;
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
      completion: buildContractIntakeStartupFailure(input.error),
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
    error: input.error
  });
}

function buildContractIntakeStartupFailure(
  error: SymphonyCapabilityContractIntakeValidationError
): Extract<SymphonyAgentRuntimeCompletion, { kind: "startup_failure" }> {
  return {
    kind: "startup_failure",
    reason: `Capability contract intake failed: ${error.message}`,
    failureStage: "workspace_before_run",
    failureOrigin: "capability_contract_intake"
  };
}

async function leaveContractIntakeFailureComment(input: {
  tracker: SymphonyTracker;
  issue: SymphonyTrackerIssue;
  error: SymphonyCapabilityContractIntakeValidationError;
}) {
  try {
    await input.tracker.createComment(
      input.issue.id,
      buildContractIntakeFailureCommentBody(input.error)
    );
  } catch {
    return;
  }
}

function buildContractIntakeFailureCommentBody(
  error: SymphonyCapabilityContractIntakeValidationError
): string {
  return [
    "Symphony capability routing failed before execution.",
    "",
    "State: `Failed`",
    "What changed: Symphony stopped before starting implementation because the ticket body or routing directives could not be normalized into a valid execution contract.",
    `Blocking validation: \`${error.message}\``,
    "Next step: update the ticket body or routing directives so Symphony can derive a valid execution contract, then move the issue back to `Todo` to retry dispatch."
  ].join("\n");
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

    currentIssue = await executeSettledRouteCommand({
      routeWorkflows: input.routeWorkflows,
      workflowId: input.workflowId,
      session: input.session,
      loadSettlementSession: input.loadSettlementSession,
      command,
      recordedAt: input.recordedAt,
      async execute(executedCommand) {
        const targetState = readTrackerTransitionState({
          adapter: input.presetAdapter,
          command: executedCommand
        });
        await input.tracker.updateIssueState(currentIssue.id, targetState);
        return {
          ...currentIssue,
          state: targetState
        };
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
