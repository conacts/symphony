import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
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

export type SymphonyTrackerStateObservationInput = {
  issueIdentifier: string;
  recordedAt: string;
  runId?: string | null;
  runMode?: SymphonyRunMode | null;
  onDispatchRequested?(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<void> | void;
};

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

      const result = await resumed.session.receiveAsync({
        id: buildTrackerStateObservedSignalId({
          issue,
          runMode: observationInput.runMode ?? null,
          recordedAt: observationInput.recordedAt
        }),
        type: "tracker.state_observed",
        source: "tracker",
        occurredAt: observationInput.recordedAt,
        payload: {
          state: issue.state,
          runId: observationInput.runId ?? null,
          runMode: observationInput.runMode ?? null
        },
        causationId: observationInput.runId ?? null,
        correlationId: issue.identifier
      });

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
              if (!observationInput.onDispatchRequested) {
                throw new TypeError(
                  "Tracker state observation emitted run.dispatch without a dispatch callback."
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
  const targetState = readTrackerTransitionState(input.command.payload);
  if (!targetState) {
    throw new TypeError(
      `Route command ${input.command.id} is missing a tracker transition state.`
    );
  }

  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function readObservedDispatchRunMode(command: WorkflowCommand): SymphonyRunMode {
  const runMode = readDispatchRunMode(command.payload);
  if (
    runMode !== "implementation" &&
    runMode !== "rework" &&
    runMode !== "approved_merge"
  ) {
    throw new TypeError(
      `Route command ${command.id} is missing a supported dispatch run mode.`
    );
  }

  return runMode;
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
