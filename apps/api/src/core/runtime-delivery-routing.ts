import {
  createSymphonyCurrentFlowDeliveryReportedSignal,
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

export type SymphonyDeliveryStatus = "completed" | "blocked" | "partial";

export type SymphonyDeliveryRoutingInput = {
  issue: SymphonyTrackerIssue;
  runId: string;
  recordedAt: string;
  status: SymphonyDeliveryStatus;
};

export type SymphonyDeliveryRoutingResult = {
  issue: SymphonyTrackerIssue;
};

export type SymphonyDeliveryRouter = {
  routeDelivery(
    input: SymphonyDeliveryRoutingInput
  ): Promise<SymphonyDeliveryRoutingResult>;
};

export async function createRuntimeDeliveryRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  routing: SymphonyRuntimeCurrentFlowRouting;
}): Promise<SymphonyDeliveryRouter> {
  const { router, policy } = input.routing;

  return {
    async routeDelivery(
      deliveryInput
    ): Promise<SymphonyDeliveryRoutingResult> {
      const resumed = await input.routeWorkflows.resumeSessionByIssueIdentifier({
        issueIdentifier: deliveryInput.issue.identifier,
        router,
        policy
      });

      if (!resumed) {
        throw new TypeError(
          `Route workflow could not be resumed for ${deliveryInput.issue.identifier} during delivery routing.`
        );
      }

      const result = await resumed.session.receiveAsync(
        createSymphonyCurrentFlowDeliveryReportedSignal({
          id: buildDeliveryReportedSignalId({
            issue: deliveryInput.issue,
            status: deliveryInput.status,
            recordedAt: deliveryInput.recordedAt
          }),
          occurredAt: deliveryInput.recordedAt,
          runId: deliveryInput.runId,
          status: deliveryInput.status,
          causationId: deliveryInput.runId,
          correlationId: deliveryInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy,
        result
      });

      const routedIssue = await executeDeliveryCommands({
        commands: result.decision.commands,
        issue: deliveryInput.issue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        recordedAt: deliveryInput.recordedAt,
        status: deliveryInput.status
      });

      return {
        issue: routedIssue
      };
    }
  };
}

async function executeDeliveryCommands(input: {
  commands: WorkflowCommand[];
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: WorkflowSession<string, unknown, unknown>;
  recordedAt: string;
  status: SymphonyDeliveryStatus;
}): Promise<SymphonyTrackerIssue> {
  let currentIssue = input.issue;

  for (const command of input.commands) {
    if (command.kind !== "tracker.transition") {
      throw new TypeError(
        `Delivery routing does not support command kind ${command.kind}.`
      );
    }

    currentIssue = await executeSettledRouteCommand({
      routeWorkflows: input.routeWorkflows,
      workflowId: input.workflowId,
      session: input.session,
      command,
      recordedAt: input.recordedAt,
      async execute(executedCommand) {
        return await executeDeliveryTrackerTransition({
          command: executedCommand,
          issue: currentIssue,
          tracker: input.tracker,
          status: input.status
        });
      }
    });
  }

  return currentIssue;
}

async function executeDeliveryTrackerTransition(input: {
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  status: SymphonyDeliveryStatus;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState(input.command);
  const expectedTargetState =
    input.status === "completed"
      ? "In Review"
      : input.status === "blocked"
        ? "Blocked"
        : null;

  if (!expectedTargetState) {
    throw new TypeError(
      `Delivery routing only supports explicit tracker transitions for completed or blocked delivery statuses. Received ${input.status}.`
    );
  }

  if (targetState !== expectedTargetState) {
    throw new TypeError(
      `Delivery routing only supports tracker transitions to ${expectedTargetState} for ${input.status} delivery reports. Received ${String(targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildDeliveryReportedSignalId(input: {
  issue: SymphonyTrackerIssue;
  status: SymphonyDeliveryStatus;
  recordedAt: string;
}) {
  return [
    "signal",
    "delivery_reported",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.status),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
