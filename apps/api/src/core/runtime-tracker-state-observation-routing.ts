import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  type WorkflowCommand
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerConfig,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRuntimeRouterPresetSelection } from "./runtime-workflow-presets.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";
import {
  createRouteCommandSettlementSessionLoader,
  executeSettledRouteCommand,
  normalizeWorkflowToken,
  readDispatchRunMode,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export type SymphonyTrackerStateDispatchRequest = {
  workflowId: string;
  commandId: string;
  issue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode;
  recordedAt: string;
};

export type SymphonyIdleTrackerStateObservationInput = {
  observationKind: "idle";
  issueIdentifier: string;
  recordedAt: string;
  onDispatchRequested?(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<void> | void;
};

export type SymphonyActiveTrackerStateObservationInput = {
  observationKind: "active";
  issueIdentifier: string;
  recordedAt: string;
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

export async function createRuntimeTrackerStateObservationRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  trackerConfig: SymphonyTrackerConfig;
  repositoryKey: string;
  resolveIssueRepositoryKey?(issue: SymphonyTrackerIssue): string;
  ensureIssueIdentity?(
    issue: SymphonyTrackerIssue
  ): Promise<void> | void;
  routing: SymphonyRuntimeRouterPresetSelection;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}): Promise<SymphonyTrackerStateObservationRouter> {
  const { router } = input.routing;

  return {
    async observe(
      observationInput
    ): Promise<SymphonyTrackerStateObservationResult | null> {
      const issue = await input.tracker.fetchIssueByIdentifier(
        input.trackerConfig,
        observationInput.issueIdentifier
      );
      if (!issue) {
        return null;
      }

      await input.ensureIssueIdentity?.(issue);

      const repositoryKey =
        input.resolveIssueRepositoryKey?.(issue) ?? input.repositoryKey;
      const ensured = await input.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: issue.identifier,
        repositoryKey,
        routerPresetId: input.routing.presetId,
        router,
        createdAt: observationInput.recordedAt
      });

      const loaded = await input.sessionLoader.resumeByWorkflowId({
        workflowId: ensured.workflow.workflowId
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${issue.identifier} during tracker state observation.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;
      const observedTrackerState = issue.state;
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
            issueId: issue.id,
            observedTrackerState,
            runMode: observedRunMode,
            recordedAt: observationInput.recordedAt
          }),
          occurredAt: observationInput.recordedAt,
          trackerState: observedTrackerState,
          runId: observedRunId,
          runMode: observedRunMode,
          causationId: observedRunId,
          correlationId: issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      let currentIssue = issue;
      for (const command of result.decision.commands) {
        if (command.kind === "tracker.transition") {
          currentIssue = await executeSettledRouteCommand({
            routeWorkflows: input.routeWorkflows,
            workflowId: resumed.hydrationState.workflow.workflowId,
            session: resumed.session,
            loadSettlementSession,
            command,
            recordedAt: observationInput.recordedAt,
            async execute(executedCommand) {
              return await executeTrackerTransition({
                presetAdapter,
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
            workflowId: resumed.hydrationState.workflow.workflowId,
            session: resumed.session,
            loadSettlementSession,
            command,
            recordedAt: observationInput.recordedAt,
            async execute(executedCommand) {
              const runMode = readDispatchRunMode({
                adapter: presetAdapter,
                command: executedCommand
              });
              if (
                observationInput.observationKind !== "idle" ||
                !observationInput.onDispatchRequested
              ) {
                throw new TypeError(
                  "Idle tracker state observation emitted run.dispatch without a dispatch callback."
                );
              }

              await observationInput.onDispatchRequested({
                workflowId: resumed.hydrationState.workflow.workflowId,
                commandId: executedCommand.id,
                issue: currentIssue,
                runMode,
                recordedAt: observationInput.recordedAt
              });
            }
          });
          continue;
        }

        throw new TypeError(
          `Tracker state observation does not support command kind ${command.kind}.`
        );
      }

      return {
        issue: currentIssue
      };
    }
  };
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
