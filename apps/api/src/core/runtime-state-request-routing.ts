import {
  createSymphonyCurrentFlowStateRequestedSignal,
  type SymphonyCurrentFlowStateRequestKind,
  type SymphonyCurrentFlowStateRequestTargetState,
  type WorkflowCommand,
  type WorkflowSession
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

export type SymphonyRuntimeStateRequestRoutingInput = {
  issue: SymphonyTrackerIssue;
  runId: string;
  recordedAt: string;
  requestKind: SymphonyCurrentFlowStateRequestKind;
  targetState: SymphonyCurrentFlowStateRequestTargetState;
};

export type SymphonyRuntimeStateRequestRoutingResult = {
  issue: SymphonyTrackerIssue;
};

export type SymphonyRuntimeStateRequestRouter = {
  routeStateRequest(
    input: SymphonyRuntimeStateRequestRoutingInput
  ): Promise<SymphonyRuntimeStateRequestRoutingResult>;
};

export async function createRuntimeStateRequestRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  routing: SymphonyRuntimeCurrentFlowRouting;
}): Promise<SymphonyRuntimeStateRequestRouter> {
  const { router, policy } = input.routing;

  return {
    async routeStateRequest(
      stateRequestInput
    ): Promise<SymphonyRuntimeStateRequestRoutingResult> {
      const resumed = await input.routeWorkflows.resumeSessionByIssueIdentifier({
        issueIdentifier: stateRequestInput.issue.identifier,
        router,
        policy
      });

      if (!resumed) {
        throw new TypeError(
          `Route workflow could not be resumed for ${stateRequestInput.issue.identifier} during runtime state-request routing.`
        );
      }

      const result = await resumed.session.receiveAsync(
        createSymphonyCurrentFlowStateRequestedSignal({
          id: buildStateRequestedSignalId({
            issue: stateRequestInput.issue,
            requestKind: stateRequestInput.requestKind,
            targetState: stateRequestInput.targetState,
            recordedAt: stateRequestInput.recordedAt
          }),
          occurredAt: stateRequestInput.recordedAt,
          runId: stateRequestInput.runId,
          requestKind: stateRequestInput.requestKind,
          targetState: stateRequestInput.targetState,
          causationId: stateRequestInput.runId,
          correlationId: stateRequestInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy,
        result
      });

      const routedIssue = await executeRequestedStateCommands({
        commands: result.decision.commands,
        issue: stateRequestInput.issue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        recordedAt: stateRequestInput.recordedAt,
        targetState: stateRequestInput.targetState
      });

      return {
        issue: routedIssue
      };
    }
  };
}

async function executeRequestedStateCommands(input: {
  commands: WorkflowCommand[];
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: WorkflowSession<string, unknown, unknown>;
  recordedAt: string;
  targetState: SymphonyCurrentFlowStateRequestTargetState;
}): Promise<SymphonyTrackerIssue> {
  let currentIssue = input.issue;

  for (const command of input.commands) {
    if (command.kind !== "tracker.transition") {
      throw new TypeError(
        `Runtime state-request routing does not support command kind ${command.kind}.`
      );
    }

    currentIssue = await executeSettledRouteCommand({
      routeWorkflows: input.routeWorkflows,
      workflowId: input.workflowId,
      session: input.session,
      command,
      recordedAt: input.recordedAt,
      async execute(executedCommand) {
        return await executeRequestedTrackerTransition({
          command: executedCommand,
          issue: currentIssue,
          tracker: input.tracker,
          targetState: input.targetState
        });
      }
    });
  }

  return currentIssue;
}

async function executeRequestedTrackerTransition(input: {
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  targetState: SymphonyCurrentFlowStateRequestTargetState;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState(input.command);
  if (targetState !== input.targetState) {
    throw new TypeError(
      `Runtime state-request routing expected tracker transition to ${input.targetState}. Received ${String(targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildStateRequestedSignalId(input: {
  issue: SymphonyTrackerIssue;
  requestKind: SymphonyCurrentFlowStateRequestKind;
  targetState: SymphonyCurrentFlowStateRequestTargetState;
  recordedAt: string;
}) {
  return [
    "signal",
    "state_requested",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.requestKind),
    normalizeWorkflowToken(input.targetState),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
