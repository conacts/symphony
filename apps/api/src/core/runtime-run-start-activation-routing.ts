import type {
  SymphonyRunStartActivationResult,
  SymphonyRunStartActivationRouter
} from "@symphony/orchestrator";
import {
  createSymphonyCurrentFlowRouterAsync,
  type SymphonyCurrentFlowData,
  type SymphonyCurrentFlowNode,
  type SymphonyCurrentFlowPolicy,
  type WorkflowCommand
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
  normalizeWorkflowToken,
  readTrackerTransitionState,
  settleRouteCommand
} from "./runtime-route-workflow-command-utils.js";

const symphonyCurrentFlowPolicy: SymphonyCurrentFlowPolicy = {};

export async function createRuntimeRunStartActivationRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  now?: () => Date;
}): Promise<SymphonyRunStartActivationRouter> {
  const router = await createSymphonyCurrentFlowRouterAsync({
    now: input.now
  });

  return {
    async activate(activationInput): Promise<SymphonyRunStartActivationResult> {
      const resumed = await input.routeWorkflows.resumeSessionByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        issueIdentifier: activationInput.issue.identifier,
        router,
        policy: symphonyCurrentFlowPolicy
      });

      if (!resumed) {
        throw new TypeError(
          `Route workflow could not be resumed for ${activationInput.issue.identifier} at run start.`
        );
      }

      const result = await resumed.session.receiveAsync({
        id: buildRunStartedSignalId({
          issue: activationInput.issue,
          runMode: activationInput.runMode,
          recordedAt: activationInput.recordedAt
        }),
        type: "runtime.run_started",
        source: "runtime",
        occurredAt: activationInput.recordedAt,
        payload: {
          runId: activationInput.runId,
          runMode: activationInput.runMode,
          threadId: activationInput.threadId,
          workerHost: activationInput.workerHost,
          launchTarget: activationInput.launchTarget
        },
        causationId: activationInput.runId,
        correlationId: activationInput.issue.identifier
      });

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: symphonyCurrentFlowPolicy,
        result
      });

      let activatedIssue = activationInput.issue;
      for (const command of result.decision.commands) {
        if (command.kind === "tracker.transition") {
          try {
            activatedIssue = await executeInProgressTransition({
              command,
              issue: activatedIssue,
              tracker: input.tracker
            });
            await settleRouteCommand({
              routeWorkflows: input.routeWorkflows,
              workflowId: resumed.hydrationState.workflow.workflowId,
              session: resumed.session,
              commandId: command.id,
              status: "succeeded",
              recordedAt: activationInput.recordedAt
            });
          } catch (error) {
            await settleRouteCommand({
              routeWorkflows: input.routeWorkflows,
              workflowId: resumed.hydrationState.workflow.workflowId,
              session: resumed.session,
              commandId: command.id,
              status: "failed",
              payload: {
                error: String(error)
              },
              recordedAt: activationInput.recordedAt
            });
            throw error;
          }
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
  const targetState = readTrackerTransitionState(input.command.payload);
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
