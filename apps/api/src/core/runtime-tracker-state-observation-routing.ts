import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  createSymphonyCurrentFlowTrackerStateObservedSignal,
  parseSymphonyCurrentFlowTrackerState,
  type WorkflowCommand
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerConfig,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeCurrentFlowRouting } from "./runtime-current-flow-routing.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
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
  routing: SymphonyRuntimeCurrentFlowRouting;
}): Promise<SymphonyTrackerStateObservationRouter> {
  const { router, policy } = input.routing;

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

      await input.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: issue.identifier,
        repositoryKey: input.repositoryKey,
        routerPresetId: input.routing.presetId,
        router,
        createdAt: observationInput.recordedAt
      });

      const resumed = await input.routeWorkflows.resumeSessionByIssueIdentifier({
        issueIdentifier: issue.identifier,
        router,
        policy
      });
      if (!resumed) {
        throw new TypeError(
          `Route workflow could not be resumed for ${issue.identifier} during tracker state observation.`
        );
      }

      const observedRunId = readObservedRunId(observationInput);
      const observedRunMode = readObservedRunMode(observationInput);
      const result = await resumed.session.receiveAsync(
        createSymphonyCurrentFlowTrackerStateObservedSignal({
          id: buildTrackerStateObservedSignalId({
            issue,
            runMode: observedRunMode,
            recordedAt: observationInput.recordedAt
          }),
          occurredAt: observationInput.recordedAt,
          state: parseSymphonyCurrentFlowTrackerState(issue.state),
          runId: observedRunId,
          runMode: observedRunMode,
          causationId: observedRunId,
          correlationId: issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy,
        result
      });

      let currentIssue = issue;
      for (const command of result.decision.commands) {
        if (command.kind === "tracker.transition") {
          currentIssue = await executeSettledRouteCommand({
            routeWorkflows: input.routeWorkflows,
            workflowId: resumed.hydrationState.workflow.workflowId,
            session: resumed.session,
            command,
            recordedAt: observationInput.recordedAt,
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
            workflowId: resumed.hydrationState.workflow.workflowId,
            session: resumed.session,
            command,
            recordedAt: observationInput.recordedAt,
            async execute(executedCommand) {
              const runMode = readObservedDispatchRunMode(executedCommand);
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

function readObservedDispatchRunMode(command: WorkflowCommand): SymphonyRunMode {
  return readDispatchRunMode(command);
}

function buildTrackerStateObservedSignalId(input: {
  issue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode | null;
  recordedAt: string;
}) {
  return [
    "signal",
    "tracker_state_observed",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.issue.state),
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
