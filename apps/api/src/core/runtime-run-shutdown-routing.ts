import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  createSymphonyCurrentFlowShutdownRequestedSignal,
  type WorkflowCommand
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeCurrentFlowSessionLoader } from "./runtime-current-flow-session-loader.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
  executeSettledRouteCommand,
  normalizeWorkflowToken,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export type SymphonyRunShutdownRoutingInput = {
  issue: SymphonyTrackerIssue;
  runId: string;
  runMode: SymphonyRunMode;
  recordedAt: string;
  reason: string;
};

export type SymphonyRunShutdownRoutingResult = {
  issue: SymphonyTrackerIssue;
};

export type SymphonyRunShutdownRouter = {
  routeShutdown(
    input: SymphonyRunShutdownRoutingInput
  ): Promise<SymphonyRunShutdownRoutingResult>;
};

export async function createRuntimeRunShutdownRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeCurrentFlowSessionLoader;
}): Promise<SymphonyRunShutdownRouter> {
  return {
    async routeShutdown(
      shutdownInput
    ): Promise<SymphonyRunShutdownRoutingResult> {
      const loaded = await input.sessionLoader.resumeByIssueIdentifier({
        issueIdentifier: shutdownInput.issue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${shutdownInput.issue.identifier} during shutdown routing.`
        );
      }
      const { resumed } = loaded;

      const result = await resumed.session.receiveAsync(
        createSymphonyCurrentFlowShutdownRequestedSignal({
          id: buildShutdownRequestedSignalId({
            issue: shutdownInput.issue,
            runMode: shutdownInput.runMode,
            recordedAt: shutdownInput.recordedAt
          }),
          occurredAt: shutdownInput.recordedAt,
          runId: shutdownInput.runId,
          runMode: shutdownInput.runMode,
          reason: shutdownInput.reason,
          causationId: shutdownInput.runId,
          correlationId: shutdownInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      let pausedIssue = shutdownInput.issue;
      for (const command of result.decision.commands) {
        if (command.kind !== "tracker.transition") {
          throw new TypeError(
            `Run shutdown routing does not support command kind ${command.kind}.`
          );
        }

        pausedIssue = await executeSettledRouteCommand({
          routeWorkflows: input.routeWorkflows,
          workflowId: resumed.hydrationState.workflow.workflowId,
          session: resumed.session,
          command,
          recordedAt: shutdownInput.recordedAt,
          async execute(executedCommand) {
            return await executePausedTransition({
              command: executedCommand,
              issue: pausedIssue,
              tracker: input.tracker
            });
          }
        });
      }

      return {
        issue: pausedIssue
      };
    }
  };
}

async function executePausedTransition(input: {
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState(input.command);
  if (targetState !== "Paused") {
    throw new TypeError(
      `Run shutdown routing only supports tracker transitions to Paused. Received ${String(targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildShutdownRequestedSignalId(input: {
  issue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode;
  recordedAt: string;
}) {
  return [
    "signal",
    "shutdown_requested",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.runMode),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
