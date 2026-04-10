import {
  createSymphonyCurrentFlowMergeResultReportedSignal,
  type SymphonyCurrentFlowMergeResultStatus,
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

export type SymphonyMergeResultRoutingInput = {
  issue: SymphonyTrackerIssue;
  runId: string;
  recordedAt: string;
  status: SymphonyCurrentFlowMergeResultStatus;
};

export type SymphonyMergeResultRoutingResult = {
  issue: SymphonyTrackerIssue;
};

export type SymphonyMergeResultRouter = {
  routeMergeResult(
    input: SymphonyMergeResultRoutingInput
  ): Promise<SymphonyMergeResultRoutingResult>;
};

export async function createRuntimeMergeResultRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  routing: SymphonyRuntimeCurrentFlowRouting;
}): Promise<SymphonyMergeResultRouter> {
  const { router, policy } = input.routing;

  return {
    async routeMergeResult(
      mergeResultInput
    ): Promise<SymphonyMergeResultRoutingResult> {
      const resumed = await input.routeWorkflows.resumeSessionByIssueIdentifier({
        issueIdentifier: mergeResultInput.issue.identifier,
        router,
        policy
      });

      if (!resumed) {
        throw new TypeError(
          `Route workflow could not be resumed for ${mergeResultInput.issue.identifier} during merge-result routing.`
        );
      }

      const result = await resumed.session.receiveAsync(
        createSymphonyCurrentFlowMergeResultReportedSignal({
          id: buildMergeResultReportedSignalId({
            issue: mergeResultInput.issue,
            status: mergeResultInput.status,
            recordedAt: mergeResultInput.recordedAt
          }),
          occurredAt: mergeResultInput.recordedAt,
          runId: mergeResultInput.runId,
          status: mergeResultInput.status,
          causationId: mergeResultInput.runId,
          correlationId: mergeResultInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy,
        result
      });

      const routedIssue = await executeMergeResultCommands({
        commands: result.decision.commands,
        issue: mergeResultInput.issue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        recordedAt: mergeResultInput.recordedAt,
        status: mergeResultInput.status
      });

      return {
        issue: routedIssue
      };
    }
  };
}

async function executeMergeResultCommands(input: {
  commands: WorkflowCommand[];
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: WorkflowSession<string, unknown, unknown>;
  recordedAt: string;
  status: SymphonyCurrentFlowMergeResultStatus;
}): Promise<SymphonyTrackerIssue> {
  let currentIssue = input.issue;

  for (const command of input.commands) {
    if (command.kind !== "tracker.transition") {
      throw new TypeError(
        `Merge-result routing does not support command kind ${command.kind}.`
      );
    }

    currentIssue = await executeSettledRouteCommand({
      routeWorkflows: input.routeWorkflows,
      workflowId: input.workflowId,
      session: input.session,
      command,
      recordedAt: input.recordedAt,
      async execute(executedCommand) {
        return await executeMergeResultTrackerTransition({
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

async function executeMergeResultTrackerTransition(input: {
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  status: SymphonyCurrentFlowMergeResultStatus;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState(input.command);
  const expectedTargetState = input.status === "merged" ? "Done" : "Blocked";

  if (targetState !== expectedTargetState) {
    throw new TypeError(
      `Merge-result routing only supports tracker transitions to ${expectedTargetState} for ${input.status} merge results. Received ${String(targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildMergeResultReportedSignalId(input: {
  issue: SymphonyTrackerIssue;
  status: SymphonyCurrentFlowMergeResultStatus;
  recordedAt: string;
}) {
  return [
    "signal",
    "merge_result_reported",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.status),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
