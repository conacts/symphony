import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyRunLifecycleCompletionInput,
  SymphonyRunLifecycleCompletionResult,
  SymphonyRunLifecycleObservationInput,
  SymphonyRunLifecycleObservationResult
} from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  createSymphonyCurrentFlowRuntimeCompletedSignal,
  createSymphonyCurrentFlowRuntimeStartupFailureSignal,
  createSymphonyCurrentFlowTrackerStateObservedSignal,
  parseSymphonyCurrentFlowTrackerState,
  type WorkflowCommand,
  type WorkflowSession
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type {
  SymphonyRuntimeCurrentFlowRouting
} from "./runtime-current-flow-routing.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
  executeSettledRouteCommand,
  normalizeWorkflowToken,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export async function createRuntimeRunLifecycleRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  routing: SymphonyRuntimeCurrentFlowRouting;
}) {
  const { router, policy } = input.routing;

  return {
    async observeIssueState(
      observationInput: SymphonyRunLifecycleObservationInput
    ): Promise<SymphonyRunLifecycleObservationResult> {
      const resumed = await input.routeWorkflows.resumeSessionByIssueIdentifier({
        issueIdentifier: observationInput.issue.identifier,
        router,
        policy
      });

      if (!resumed) {
        throw new TypeError(
          `Route workflow could not be resumed for ${observationInput.issue.identifier} during running issue observation.`
        );
      }

      const result = await resumed.session.receiveAsync(
        createSymphonyCurrentFlowTrackerStateObservedSignal({
          id: buildRunningIssueObservedSignalId({
            issue: observationInput.issue,
            runMode: observationInput.runMode,
            recordedAt: observationInput.recordedAt
          }),
          occurredAt: observationInput.recordedAt,
          state: parseSymphonyCurrentFlowTrackerState(
            observationInput.issue.state
          ),
          runId: observationInput.runId,
          runMode: observationInput.runMode,
          causationId: observationInput.runId,
          correlationId: observationInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy,
        result
      });

      const observedIssue = await executeTrackerTransitionCommands({
        commands: result.decision.commands,
        issue: observationInput.issue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        recordedAt: observationInput.recordedAt,
        unsupportedCommandErrorPrefix:
          "Run lifecycle observation does not support command kind"
      });

      return {
        issue: observedIssue
      };
    },

    async routeCompletion(
      completionInput: SymphonyRunLifecycleCompletionInput
    ): Promise<SymphonyRunLifecycleCompletionResult> {
      const resumed = await input.routeWorkflows.resumeSessionByIssueIdentifier({
        issueIdentifier: completionInput.issue.identifier,
        router,
        policy
      });

      if (!resumed) {
        throw new TypeError(
          `Route workflow could not be resumed for ${completionInput.issue.identifier} during run completion routing.`
        );
      }

      const result = await resumed.session.receiveAsync(
        buildCompletionSignal(completionInput)
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy,
        result
      });

      const completedIssue = await executeTrackerTransitionCommands({
        commands: result.decision.commands,
        issue: completionInput.issue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        recordedAt: completionInput.recordedAt,
        unsupportedCommandErrorPrefix:
          "Run completion routing does not support command kind"
      });

      return {
        issue: completedIssue
      };
    }
  };
}

async function executeTrackerTransitionCommands(input: {
  commands: WorkflowCommand[];
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: WorkflowSession<string, unknown, unknown>;
  recordedAt: string;
  unsupportedCommandErrorPrefix: string;
}): Promise<SymphonyTrackerIssue> {
  let currentIssue = input.issue;

  for (const command of input.commands) {
    if (command.kind !== "tracker.transition") {
      throw new TypeError(
        `${input.unsupportedCommandErrorPrefix} ${command.kind}.`
      );
    }

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
  }

  return currentIssue;
}

async function executeTrackerTransition(input: {
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState(input.command);
  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildRunningIssueObservedSignalId(input: {
  issue: SymphonyTrackerIssue;
  runMode: string;
  recordedAt: string;
}) {
  return [
    "signal",
    "running_issue_observed",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.issue.state),
    normalizeWorkflowToken(input.runMode),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}

function buildCompletionSignal(input: {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  runMode: SymphonyRunMode;
  completion: SymphonyAgentRuntimeCompletion;
  recordedAt: string;
}) {
  if (input.completion.kind === "startup_failure") {
    return createSymphonyCurrentFlowRuntimeStartupFailureSignal({
      id: buildCompletionSignalId({
        issue: input.issue,
        completionKind: input.completion.kind,
        recordedAt: input.recordedAt
      }),
      occurredAt: input.recordedAt,
      runId: input.runId,
      runMode: input.runMode,
      reason: input.completion.reason,
      failureStage: input.completion.failureStage,
      failureOrigin: input.completion.failureOrigin,
      causationId: input.runId,
      correlationId: input.issue.identifier
    });
  }

  return createSymphonyCurrentFlowRuntimeCompletedSignal({
    id: buildCompletionSignalId({
      issue: input.issue,
      completionKind: input.completion.kind,
      recordedAt: input.recordedAt
    }),
    occurredAt: input.recordedAt,
    kind: input.completion.kind,
    runId: input.runId,
    runMode: input.runMode,
    reason: "reason" in input.completion ? input.completion.reason : null,
    causationId: input.runId,
    correlationId: input.issue.identifier
  });
}

function buildCompletionSignalId(input: {
  issue: SymphonyTrackerIssue;
  completionKind: string;
  recordedAt: string;
}) {
  return [
    "signal",
    "run_completed",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.completionKind),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
