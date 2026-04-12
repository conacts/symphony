import type {
  SymphonyRunStartActivationInput,
  SymphonyRunStartActivationResult
} from "@symphony/orchestrator";
import { type WorkflowCommand } from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";
import {
  createRouteCommandSettlementSessionLoader,
  executeSettledRouteCommand,
  normalizeWorkflowToken,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export async function createRuntimeRunStartActivationRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}) {
  return {
    async activate(
      activationInput: SymphonyRunStartActivationInput
    ): Promise<SymphonyRunStartActivationResult> {
      const loaded = await input.sessionLoader.resumeByIssueIdentifier({
        issueIdentifier: activationInput.issue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${activationInput.issue.identifier} at run start.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;

      const result = await resumed.session.receiveAsync(
        presetAdapter.createRunStartedSignal({
          id: buildRunStartedSignalId({
            issue: activationInput.issue,
            runMode: activationInput.runMode,
            recordedAt: activationInput.recordedAt
          }),
          occurredAt: activationInput.recordedAt,
          runId: activationInput.runId,
          runMode: activationInput.runMode,
          causationId: activationInput.runId,
          correlationId: activationInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      let activatedIssue = activationInput.issue;
      const loadSettlementSession = createRouteCommandSettlementSessionLoader({
        sessionLoader: input.sessionLoader,
        workflowId: resumed.hydrationState.workflow.workflowId,
        failureContext:
          "while settling run-start activation route commands"
      });
      for (const command of result.decision.commands) {
        if (command.kind === "tracker.transition") {
          activatedIssue = await executeSettledRouteCommand({
            routeWorkflows: input.routeWorkflows,
            workflowId: resumed.hydrationState.workflow.workflowId,
            session: resumed.session,
            loadSettlementSession,
            command,
            recordedAt: activationInput.recordedAt,
            async execute(executedCommand) {
              return await executeInProgressTransition({
                presetAdapter,
                command: executedCommand,
                issue: activatedIssue,
                tracker: input.tracker
              });
            }
          });
          continue;
        }

        throw new TypeError(
          `Run start activation router does not support command kind ${command.kind}.`
        );
      }

      return {
        issue: activatedIssue
      };
    }
  };
}

async function executeInProgressTransition(input: {
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState({
    adapter: input.presetAdapter,
    command: input.command
  });
  if (targetState !== "In Progress") {
    throw new TypeError(
      `Run start activation only supports tracker transitions to In Progress. Received ${String(targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildRunStartedSignalId(input: {
  issue: SymphonyTrackerIssue;
  runMode: string;
  recordedAt: string;
}) {
  return [
    "signal",
    "run_started",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.runMode),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
