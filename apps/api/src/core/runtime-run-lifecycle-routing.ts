import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyRunLifecycleCompletionInput,
  SymphonyRunLifecycleCompletionResult,
  SymphonyRunLifecycleObservationInput,
  SymphonyRunLifecycleObservationResult
} from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  type WorkflowCommand
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";
import type {
  SymphonyRuntimeWorkflowSettlementSession
} from "./runtime-workflow-session-types.js";
import {
  createRouteCommandSettlementSessionLoader,
  executeSettledRouteCommand,
  executeSettledTrackerTransitionCommand,
  normalizeWorkflowToken,
  readDispatchRunMode,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

type SupportedRunLifecycleObservationCommand = WorkflowCommand<
  "tracker.transition" | "run.dispatch"
>;
type SupportedRunCompletionCommand = WorkflowCommand<"tracker.transition">;

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

      const observedIssue = await executeObservationCommands({
        commands: result.decision.commands,
        issue: observationInput.issue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        loadSettlementSession: createRouteCommandSettlementSessionLoader({
          sessionLoader: input.sessionLoader,
          workflowId: resumed.hydrationState.workflow.workflowId,
          failureContext:
            "while settling run-lifecycle observation route commands"
        }),
        recordedAt: observationInput.recordedAt,
        presetAdapter,
        activeRunMode: observationInput.runMode
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

      const completedIssue = await executeCompletionCommands({
        commands: result.decision.commands,
        issue: completionInput.issue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        loadSettlementSession: createRouteCommandSettlementSessionLoader({
          sessionLoader: input.sessionLoader,
          workflowId: resumed.hydrationState.workflow.workflowId,
          failureContext: "while settling run-completion route commands"
        }),
        recordedAt: completionInput.recordedAt,
        presetAdapter
      });

      return {
        issue: completedIssue
      };
    }
  };
}

async function executeObservationCommands(input: {
  commands: WorkflowCommand[];
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>;
  loadSettlementSession: () => Promise<
    SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>
  >;
  recordedAt: string;
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  activeRunMode: SymphonyRunMode;
}): Promise<SymphonyTrackerIssue> {
  let currentIssue = input.issue;

  for (const command of input.commands) {
    assertSupportedObservationCommand(command);

    switch (command.kind) {
      case "tracker.transition":
        currentIssue = await executeSettledTrackerTransitionCommand({
          routeWorkflows: input.routeWorkflows,
          workflowId: input.workflowId,
          session: input.session,
          loadSettlementSession: input.loadSettlementSession,
          command,
          recordedAt: input.recordedAt,
          issue: currentIssue,
          tracker: input.tracker,
          readTargetState(executedCommand) {
            return readTrackerTransitionState({
              adapter: input.presetAdapter,
              command: executedCommand
            });
          }
        });
        break;
      case "run.dispatch":
        await executeSettledRouteCommand({
          routeWorkflows: input.routeWorkflows,
          workflowId: input.workflowId,
          session: input.session,
          loadSettlementSession: input.loadSettlementSession,
          command,
          recordedAt: input.recordedAt,
          async execute(executedCommand) {
            await executeObservedDispatch({
              presetAdapter: input.presetAdapter,
              command: executedCommand,
              activeRunMode: input.activeRunMode
            });
          }
        });
        break;
    }
  }

  return currentIssue;
}

async function executeCompletionCommands(input: {
  commands: WorkflowCommand[];
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>;
  loadSettlementSession: () => Promise<
    SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>
  >;
  recordedAt: string;
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
}): Promise<SymphonyTrackerIssue> {
  let currentIssue = input.issue;

  for (const command of input.commands) {
    assertSupportedCompletionCommand(command);

    switch (command.kind) {
      case "tracker.transition":
        currentIssue = await executeSettledTrackerTransitionCommand({
          routeWorkflows: input.routeWorkflows,
          workflowId: input.workflowId,
          session: input.session,
          loadSettlementSession: input.loadSettlementSession,
          command,
          recordedAt: input.recordedAt,
          issue: currentIssue,
          tracker: input.tracker,
          readTargetState(executedCommand) {
            return readTrackerTransitionState({
              adapter: input.presetAdapter,
              command: executedCommand
            });
          }
        });
        break;
    }
  }

  return currentIssue;
}

async function executeObservedDispatch(input: {
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
  activeRunMode: SymphonyRunMode;
}): Promise<void> {
  const dispatchRunMode = readDispatchRunMode({
    adapter: input.presetAdapter,
    command: input.command
  });
  if (dispatchRunMode !== input.activeRunMode) {
    throw new TypeError(
      `Run lifecycle observation only supports run.dispatch for active run mode ${input.activeRunMode}. Received ${dispatchRunMode}.`
    );
  }
}

function assertSupportedObservationCommand(
  command: WorkflowCommand
): asserts command is SupportedRunLifecycleObservationCommand {
  switch (command.kind) {
    case "tracker.transition":
    case "run.dispatch":
      return;
    default:
      throwUnsupportedObservationCommand(command.kind);
  }
}

function assertSupportedCompletionCommand(
  command: WorkflowCommand
): asserts command is SupportedRunCompletionCommand {
  switch (command.kind) {
    case "tracker.transition":
      return;
    default:
      throwUnsupportedCompletionCommand(command.kind);
  }
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

function throwUnsupportedObservationCommand(
  commandKind: WorkflowCommand["kind"]
): never {
  throw new TypeError(
    `Run lifecycle observation only supports tracker.transition and run.dispatch commands. Received ${commandKind}.`
  );
}

function throwUnsupportedCompletionCommand(
  commandKind: WorkflowCommand["kind"]
): never {
  throw new TypeError(
    `Run completion routing only supports tracker.transition commands. Received ${commandKind}.`
  );
}
