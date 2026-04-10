import type {
  SymphonyRunStartActivationResult,
  SymphonyRunStartActivationRouter
} from "@symphony/orchestrator";
import {
  createSymphonyCurrentFlowRunStartedSignal,
  type WorkflowCommand
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeCurrentFlowRouting } from "./runtime-current-flow-routing.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
  executeSettledRouteCommand,
  normalizeWorkflowToken,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export async function createRuntimeRunStartActivationRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  routing: SymphonyRuntimeCurrentFlowRouting;
}): Promise<SymphonyRunStartActivationRouter> {
  const { router, policy } = input.routing;

  return {
    async activate(activationInput): Promise<SymphonyRunStartActivationResult> {
      const resumed = await input.routeWorkflows.resumeSessionByIssueIdentifier({
        issueIdentifier: activationInput.issue.identifier,
        router,
        policy
      });

      if (!resumed) {
        throw new TypeError(
          `Route workflow could not be resumed for ${activationInput.issue.identifier} at run start.`
        );
      }

      const result = await resumed.session.receiveAsync(
        createSymphonyCurrentFlowRunStartedSignal({
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
        policy,
        result
      });

      let activatedIssue = activationInput.issue;
      for (const command of result.decision.commands) {
        if (command.kind === "tracker.transition") {
          activatedIssue = await executeSettledRouteCommand({
            routeWorkflows: input.routeWorkflows,
            workflowId: resumed.hydrationState.workflow.workflowId,
            session: resumed.session,
            command,
            recordedAt: activationInput.recordedAt,
            async execute(executedCommand) {
              return await executeInProgressTransition({
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
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState(input.command);
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
