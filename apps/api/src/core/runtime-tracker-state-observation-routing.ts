import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  type WorkflowCommand,
  type WorkflowNodeId,
  type WorkflowRouter
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerConfig,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRuntimeRouterPresetSelection } from "./runtime-workflow-presets.js";
import type {
  RouteWorkflowBindingScope,
  SymphonyRouteWorkflowPort
} from "./runtime-route-workflows.js";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";
import type {
  SymphonyRuntimeWorkflowSettlementSession
} from "./runtime-workflow-session-types.js";
import {
  createRouteCommandSettlementSessionLoader,
  executeSettledRouteCommand,
  normalizeWorkflowToken,
  readDispatchRunMode,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

type RuntimeWorkflowRouter = WorkflowRouter<WorkflowNodeId, unknown, unknown>;

export type SymphonyTrackerStateDispatchRequest = {
  workflowId: string;
  commandId: string;
  trackerIssue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode;
  recordedAt: string;
};

export type SymphonyIdleTrackerStateObservationInput = {
  observationKind: "idle";
  issueIdentifier: string;
  recordedAt: string;
  observedTrackerIssue?: SymphonyTrackerIssue;
  onDispatchRequested?(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<void> | void;
};

export type SymphonyActiveTrackerStateObservationInput = {
  observationKind: "active";
  issueIdentifier: string;
  recordedAt: string;
  observedTrackerIssue?: SymphonyTrackerIssue;
  runId: string | null;
  runMode: SymphonyRunMode;
};

export type SymphonyTrackerStateObservationInput =
  | SymphonyIdleTrackerStateObservationInput
  | SymphonyActiveTrackerStateObservationInput;

export type SymphonyTrackerStateObservationResult = {
  // The returned issue reflects any tracker.transition commands emitted from
  // the observed external tracker state signal.
  issue: SymphonyTrackerIssue;
};

export type SymphonyTrackerStateObservationRouter = {
  observe(
    input: SymphonyTrackerStateObservationInput
  ): Promise<SymphonyTrackerStateObservationResult | null>;
};

type SupportedTrackerObservationCommand = WorkflowCommand<
  "tracker.transition" | "run.dispatch"
>;

export async function createRuntimeTrackerStateObservationRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  trackerConfig: SymphonyTrackerConfig;
  repositoryKey: string;
  bindingScope?: RouteWorkflowBindingScope | null;
  resolveIssueRepositoryKey?(issue: SymphonyTrackerIssue): string;
  ensureIssueIdentity?(
    issue: SymphonyTrackerIssue
  ): Promise<void> | void;
  routing: SymphonyRuntimeRouterPresetSelection;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}): Promise<SymphonyTrackerStateObservationRouter> {
  const router = input.routing.router as RuntimeWorkflowRouter;

  return {
    async observe(
      observationInput
    ): Promise<SymphonyTrackerStateObservationResult | null> {
      const observedTrackerIssue =
        observationInput.observedTrackerIssue ??
        (await input.tracker.fetchIssueByIdentifier(
          input.trackerConfig,
          observationInput.issueIdentifier
        ));
      if (!observedTrackerIssue) {
        return null;
      }

      if (observedTrackerIssue.identifier !== observationInput.issueIdentifier) {
        throw new TypeError(
          `Tracker observation received preloaded issue ${JSON.stringify(observedTrackerIssue.identifier)} for requested issue ${JSON.stringify(observationInput.issueIdentifier)}.`
        );
      }

      await input.ensureIssueIdentity?.(observedTrackerIssue);

      const repositoryKey =
        input.resolveIssueRepositoryKey?.(observedTrackerIssue) ??
        input.repositoryKey;
      const ensured = await input.routeWorkflows.ensureWorkflowForIssue({
        trackerIssueId: observedTrackerIssue.id,
        issueIdentifier: observedTrackerIssue.identifier,
        repositoryKey,
        bindingScope: input.bindingScope ?? null,
        routerPresetId: input.routing.presetId,
        router,
        createdAt: observationInput.recordedAt,
        replaceIncompatibleLiveWorkflow:
          observationInput.observationKind === "idle"
      });

      const loaded = await input.sessionLoader.resumeByWorkflowId({
        workflowId: ensured.workflow.workflowId
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${observedTrackerIssue.identifier} during tracker state observation.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;
      const observedTrackerState = observedTrackerIssue.state;
      const loadSettlementSession = createRouteCommandSettlementSessionLoader({
        sessionLoader: input.sessionLoader,
        workflowId: resumed.hydrationState.workflow.workflowId,
        failureContext:
          "while settling tracker-state observation route commands"
      });

      const observedRunId = readObservedRunId(observationInput);
      const observedRunMode = readObservedRunMode(observationInput);
      const result = await resumed.session.receiveAsync(
        presetAdapter.createTrackerStateObservedSignal({
          id: buildObservedTrackerStateSignalId({
            issueId: observedTrackerIssue.id,
            observedTrackerState,
            runMode: observedRunMode,
            recordedAt: observationInput.recordedAt
          }),
          occurredAt: observationInput.recordedAt,
          trackerState: observedTrackerState,
          runId: observedRunId,
          runMode: observedRunMode,
          causationId: observedRunId,
          correlationId: observedTrackerIssue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      const currentIssue = await executeObservationCommands({
        commands: result.decision.commands,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        loadSettlementSession,
        observedTrackerIssue,
        tracker: input.tracker,
        presetAdapter,
        observationInput,
        recordedAt: observationInput.recordedAt
      });

      return {
        issue: currentIssue
      };
    }
  };
}

async function executeTrackerTransition(input: {
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
  trackerIssue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState({
    adapter: input.presetAdapter,
    command: input.command
  });
  await input.tracker.updateIssueState(input.trackerIssue.id, targetState);
  return {
    ...input.trackerIssue,
    state: targetState
  };
}

async function executeObservationCommands(input: {
  commands: WorkflowCommand[];
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>;
  loadSettlementSession: () => Promise<
    SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>
  >;
  observedTrackerIssue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  observationInput: SymphonyTrackerStateObservationInput;
  recordedAt: string;
}): Promise<SymphonyTrackerIssue> {
  let currentIssue = input.observedTrackerIssue;

  for (const command of input.commands) {
    assertSupportedObservationCommand(command);

    switch (command.kind) {
      case "tracker.transition":
        currentIssue = await executeSettledRouteCommand({
          routeWorkflows: input.routeWorkflows,
          workflowId: input.workflowId,
          session: input.session,
          loadSettlementSession: input.loadSettlementSession,
          command,
          recordedAt: input.recordedAt,
          async execute(executedCommand) {
            return await executeTrackerTransition({
              presetAdapter: input.presetAdapter,
              command: executedCommand,
              trackerIssue: currentIssue,
              tracker: input.tracker
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
              workflowId: input.workflowId,
              observationInput: input.observationInput,
              trackerIssue: currentIssue,
              presetAdapter: input.presetAdapter,
              command: executedCommand,
              recordedAt: input.recordedAt
            });
          }
        });
        break;
    }
  }

  return currentIssue;
}

async function executeObservedDispatch(input: {
  workflowId: string;
  observationInput: SymphonyTrackerStateObservationInput;
  trackerIssue: SymphonyTrackerIssue;
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
  recordedAt: string;
}): Promise<void> {
  const runMode = readDispatchRunMode({
    adapter: input.presetAdapter,
    command: input.command
  });

  switch (input.observationInput.observationKind) {
    case "idle":
      await requestIdleObservedDispatch({
        workflowId: input.workflowId,
        observationInput: input.observationInput,
        trackerIssue: input.trackerIssue,
        runMode,
        commandId: input.command.id,
        recordedAt: input.recordedAt
      });
      return;
    case "active":
      settleActiveObservedDispatch({
        observationInput: input.observationInput,
        runMode
      });
      return;
    default:
      assertUnsupportedObservationInput(input.observationInput);
  }
}

function buildObservedTrackerStateSignalId(input: {
  issueId: string;
  observedTrackerState: string;
  runMode: SymphonyRunMode | null;
  recordedAt: string;
}) {
  return [
    "signal",
    "tracker_state_observed",
    normalizeWorkflowToken(input.issueId),
    normalizeWorkflowToken(input.observedTrackerState),
    normalizeWorkflowToken(input.runMode ?? "none"),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}

function readObservedRunId(
  observationInput: SymphonyTrackerStateObservationInput
): string | null {
  return observationInput.observationKind === "active"
    ? observationInput.runId
    : null;
}

function readObservedRunMode(
  observationInput: SymphonyTrackerStateObservationInput
): SymphonyRunMode | null {
  return observationInput.observationKind === "active"
    ? observationInput.runMode
    : null;
}

async function requestIdleObservedDispatch(input: {
  workflowId: string;
  observationInput: SymphonyIdleTrackerStateObservationInput;
  trackerIssue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode;
  commandId: string;
  recordedAt: string;
}) {
  if (!input.observationInput.onDispatchRequested) {
    throw new TypeError(
      "Idle tracker state observation emitted run.dispatch without a dispatch callback."
    );
  }

  await input.observationInput.onDispatchRequested({
    workflowId: input.workflowId,
    commandId: input.commandId,
    trackerIssue: input.trackerIssue,
    runMode: input.runMode,
    recordedAt: input.recordedAt
  });
}

function settleActiveObservedDispatch(input: {
  observationInput: SymphonyActiveTrackerStateObservationInput;
  runMode: SymphonyRunMode;
}) {
  if (input.runMode !== input.observationInput.runMode) {
    throw new TypeError(
      `Active tracker state observation only supports run.dispatch for active run mode ${input.observationInput.runMode}. Received ${input.runMode}.`
    );
  }

  // Active observation is confirming tracker drift against an already running
  // workflow. A same-mode run.dispatch is settled in workflow history, not sent
  // back through the external dispatch callback surface.
}

function throwUnsupportedObservationCommand(
  commandKind: WorkflowCommand["kind"]
): never {
  throw new TypeError(
    `Tracker state observation only supports tracker.transition and run.dispatch commands. Received ${commandKind}.`
  );
}

function assertSupportedObservationCommand(
  command: WorkflowCommand
): asserts command is SupportedTrackerObservationCommand {
  switch (command.kind) {
    case "tracker.transition":
    case "run.dispatch":
      return;
    default:
      throwUnsupportedObservationCommand(command.kind);
  }
}

function assertUnsupportedObservationInput(
  observationInput: never
): never {
  throw new TypeError(
    `Tracker state observation does not support observation kind ${String(
      (observationInput as SymphonyTrackerStateObservationInput).observationKind
    )}.`
  );
}
