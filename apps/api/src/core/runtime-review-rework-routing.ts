import {
  createSymphonyCurrentFlowReviewReworkRequestedSignal,
  type WorkflowCommand,
  type WorkflowSession
} from "@symphony/router";
import type { SymphonyReworkHandoff } from "@symphony/runtime-contract";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeCurrentFlowSessionLoader } from "./runtime-current-flow-session-loader.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyTrackerStateDispatchRequest } from "./runtime-tracker-state-observation-routing.js";
import {
  executeSettledRouteCommand,
  normalizeWorkflowToken,
  readDispatchRunMode,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export type SymphonyReviewReworkRoutingInput = {
  issue: SymphonyTrackerIssue;
  recordedAt: string;
  handoff: SymphonyReworkHandoff;
  onDispatchRequested?(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<void> | void;
};

export type SymphonyReviewReworkRoutingResult = {
  issue: SymphonyTrackerIssue;
};

export type SymphonyReviewReworkRouter = {
  routeReviewRework(
    input: SymphonyReviewReworkRoutingInput
  ): Promise<SymphonyReviewReworkRoutingResult>;
};

export async function createRuntimeReviewReworkRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeCurrentFlowSessionLoader;
}): Promise<SymphonyReviewReworkRouter> {
  return {
    async routeReviewRework(
      reviewInput
    ): Promise<SymphonyReviewReworkRoutingResult> {
      const loaded = await input.sessionLoader.resumeByIssueIdentifier({
        issueIdentifier: reviewInput.issue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${reviewInput.issue.identifier} during review rework routing.`
        );
      }
      const { resumed } = loaded;

      const result = await resumed.session.receiveAsync(
        createSymphonyCurrentFlowReviewReworkRequestedSignal({
          id: buildReviewReworkRequestedSignalId({
            issue: reviewInput.issue,
            handoff: reviewInput.handoff,
            recordedAt: reviewInput.recordedAt
          }),
          occurredAt: reviewInput.recordedAt,
          handoff: reviewInput.handoff,
          causationId: reviewInput.issue.identifier,
          correlationId: reviewInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      const routedIssue = await executeReviewReworkCommands({
        commands: result.decision.commands,
        issue: reviewInput.issue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        recordedAt: reviewInput.recordedAt,
        onDispatchRequested: reviewInput.onDispatchRequested
      });

      return {
        issue: routedIssue
      };
    }
  };
}

async function executeReviewReworkCommands(input: {
  commands: WorkflowCommand[];
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: WorkflowSession<string, unknown, unknown>;
  recordedAt: string;
  onDispatchRequested?(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<void> | void;
}): Promise<SymphonyTrackerIssue> {
  let currentIssue = input.issue;

  for (const command of input.commands) {
    if (command.kind === "tracker.transition") {
      currentIssue = await executeSettledRouteCommand({
        routeWorkflows: input.routeWorkflows,
        workflowId: input.workflowId,
        session: input.session,
        command,
        recordedAt: input.recordedAt,
        async execute(executedCommand) {
          return await executeTrackerTransition({
            command: executedCommand,
            issue: currentIssue,
            tracker: input.tracker
          });
        }
      });
      continue;
    }

    if (command.kind === "run.dispatch") {
      await executeSettledRouteCommand({
        routeWorkflows: input.routeWorkflows,
        workflowId: input.workflowId,
        session: input.session,
        command,
        recordedAt: input.recordedAt,
        async execute(executedCommand) {
          if (!input.onDispatchRequested) {
            throw new TypeError(
              "Review rework routing emitted run.dispatch without a dispatch callback."
            );
          }

          await input.onDispatchRequested({
            workflowId: input.workflowId,
            commandId: executedCommand.id,
            issue: currentIssue,
            runMode: readDispatchRunMode(executedCommand),
            recordedAt: input.recordedAt
          });
        }
      });
      continue;
    }

    throw new TypeError(
      `Review rework routing does not support command kind ${command.kind}.`
    );
  }

  return currentIssue;
}

async function executeTrackerTransition(input: {
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState(input.command);
  if (targetState !== "Rework" && targetState !== "Bootstrapping") {
    throw new TypeError(
      `Review rework routing only supports tracker transitions to Rework or Bootstrapping. Received ${String(targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildReviewReworkRequestedSignalId(input: {
  issue: SymphonyTrackerIssue;
  handoff: SymphonyReworkHandoff;
  recordedAt: string;
}) {
  return [
    "signal",
    "review_rework_requested",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.handoff.triggerKind),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
