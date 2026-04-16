import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
  createRouteCommandSettlementSessionLoader,
  executeSettledTrackerTransitionCommand,
  normalizeWorkflowToken,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export type SymphonyRunShutdownRoutingInput = {
  projectedIssue: SymphonyTrackerIssue;
  runId: string;
  runMode: SymphonyRunMode;
  recordedAt: string;
  reason: string;
};

export type SymphonyRunShutdownRoutingResult = {
  projectedIssue: SymphonyTrackerIssue;
};

export type SymphonyRunShutdownRouter = {
  routeShutdown(
    input: SymphonyRunShutdownRoutingInput
  ): Promise<SymphonyRunShutdownRoutingResult>;
};

export async function createRuntimeRunShutdownRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}): Promise<SymphonyRunShutdownRouter> {
  return {
    async routeShutdown(
      shutdownInput
    ): Promise<SymphonyRunShutdownRoutingResult> {
      const loaded = await input.sessionLoader.resumeByIssueIdentifier({
        issueIdentifier: shutdownInput.projectedIssue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${shutdownInput.projectedIssue.identifier} during shutdown routing.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;

      const result = await resumed.session.receiveAsync(
        presetAdapter.createShutdownRequestedSignal({
          id: buildShutdownRequestedSignalId({
            projectedIssue: shutdownInput.projectedIssue,
            runMode: shutdownInput.runMode,
            recordedAt: shutdownInput.recordedAt
          }),
          occurredAt: shutdownInput.recordedAt,
          runId: shutdownInput.runId,
          runMode: shutdownInput.runMode,
          reason: shutdownInput.reason,
          causationId: shutdownInput.runId,
          correlationId: shutdownInput.projectedIssue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      let pausedProjectedIssue = shutdownInput.projectedIssue;
      const loadSettlementSession = createRouteCommandSettlementSessionLoader({
        sessionLoader: input.sessionLoader,
        workflowId: resumed.hydrationState.workflow.workflowId,
        failureContext: "while settling shutdown route commands"
      });
      for (const command of result.decision.commands) {
        if (command.kind !== "tracker.transition") {
          throw new TypeError(
            `Run shutdown routing does not support command kind ${command.kind}.`
          );
        }

        pausedProjectedIssue = await executeSettledTrackerTransitionCommand({
          routeWorkflows: input.routeWorkflows,
          workflowId: resumed.hydrationState.workflow.workflowId,
          session: resumed.session,
          loadSettlementSession,
          command,
          recordedAt: shutdownInput.recordedAt,
          issue: pausedProjectedIssue,
          tracker: input.tracker,
          readTargetState(executedCommand) {
            return readTrackerTransitionState({
              adapter: presetAdapter,
              command: executedCommand
            });
          },
          async executeTransition({ issue, tracker, targetState }) {
            return await executePausedTransition({
              projectedIssue: issue,
              tracker,
              targetState
            });
          }
        });
      }

      return {
        projectedIssue: pausedProjectedIssue
      };
    }
  };
}

async function executePausedTransition(input: {
  projectedIssue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  targetState: string;
}): Promise<SymphonyTrackerIssue> {
  if (input.targetState !== "Paused") {
    throw new TypeError(
      `Run shutdown routing only supports tracker transitions to Paused. Received ${String(input.targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.projectedIssue.id, input.targetState);
  return {
    ...input.projectedIssue,
    state: input.targetState
  };
}

function buildShutdownRequestedSignalId(input: {
  projectedIssue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode;
  recordedAt: string;
}) {
  return [
    "signal",
    "shutdown_requested",
    normalizeWorkflowToken(input.projectedIssue.id),
    normalizeWorkflowToken(input.runMode),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
