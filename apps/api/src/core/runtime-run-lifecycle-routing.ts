import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyRunLifecycleCompletionInput,
  SymphonyRunLifecycleCompletionResult,
  SymphonyRunLifecycleObservationInput,
  SymphonyRunLifecycleObservationResult
} from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  type WorkflowCommand,
  type WorkflowSession
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";
import {
  executeSettledRouteCommand,
  normalizeWorkflowToken,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export async function createRuntimeRunLifecycleRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}) {
  return {
    async observeIssueState(
      observationInput: SymphonyRunLifecycleObservationInput
    ): Promise<SymphonyRunLifecycleObservationResult> {
      const loaded = await input.sessionLoader.resumeByIssueIdentifier({
        issueIdentifier: observationInput.issue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${observationInput.issue.identifier} during running issue observation.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;
      const observedTrackerState = observationInput.issue.state;

      const result = await resumed.session.receiveAsync(
        presetAdapter.createTrackerStateObservedSignal({
          id: buildRunningTrackerStateObservedSignalId({
            issueId: observationInput.issue.id,
            observedTrackerState,
            runMode: observationInput.runMode,
            recordedAt: observationInput.recordedAt
          }),
          occurredAt: observationInput.recordedAt,
          trackerState: observedTrackerState,
          runId: observationInput.runId,
          runMode: observationInput.runMode,
          causationId: observationInput.runId,
          correlationId: observationInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
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
        presetAdapter,
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
      const loaded = await input.sessionLoader.resumeByIssueIdentifier({
        issueIdentifier: completionInput.issue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${completionInput.issue.identifier} during run completion routing.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;

      const result = await resumed.session.receiveAsync(
        buildCompletionSignal({
          presetAdapter,
          ...completionInput
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
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
        presetAdapter,
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
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
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
          presetAdapter: input.presetAdapter,
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
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState({
    adapter: input.presetAdapter,
    command: input.command
  });
  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildRunningTrackerStateObservedSignalId(input: {
  issueId: string;
  observedTrackerState: string;
  runMode: string;
  recordedAt: string;
}) {
  return [
    "signal",
    "running_tracker_state_observed",
    normalizeWorkflowToken(input.issueId),
    normalizeWorkflowToken(input.observedTrackerState),
    normalizeWorkflowToken(input.runMode),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}

function buildCompletionSignal(input: {
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  issue: SymphonyTrackerIssue;
  runId: string | null;
  runMode: SymphonyRunMode;
  completion: SymphonyAgentRuntimeCompletion;
  recordedAt: string;
}) {
  return input.presetAdapter.createRuntimeCompletionSignal({
    id: buildCompletionSignalId({
      issue: input.issue,
      completionKind: input.completion.kind,
      recordedAt: input.recordedAt
    }),
    occurredAt: input.recordedAt,
    runId: input.runId,
    runMode: input.runMode,
    completion: input.completion,
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
