import {
  prepareIssueForDispatch,
  type SymphonyDispatchBootstrapRoutingInput,
  type SymphonyDispatchBootstrapRoutingResult
} from "@symphony/orchestrator";
import {
  createSymphonyCurrentFlowTrackerStateObservedSignal,
  parseSymphonyCurrentFlowTrackerState,
  type WorkflowCommand
} from "@symphony/router";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
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

export async function createRuntimeDispatchBootstrapRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  trackerConfig: SymphonyTrackerConfig;
  repositoryKey: string;
  routing: SymphonyRuntimeCurrentFlowRouting;
}) {
  const { router, policy } = input.routing;

  return {
    async route(
      routeInput: SymphonyDispatchBootstrapRoutingInput
    ): Promise<SymphonyDispatchBootstrapRoutingResult> {
      const ensured = await input.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: routeInput.issue.identifier,
        repositoryKey: input.repositoryKey,
        routerPresetId: input.routing.presetId,
        router,
        createdAt: routeInput.startedAt
      });
      const resumed = await input.routeWorkflows.resumeSessionByWorkflowId({
        workflowId: ensured.workflow.workflowId,
        router,
        policy
      });

      if (!resumed) {
        throw new TypeError(
          `Route workflow ${ensured.workflow.workflowId} could not be resumed for ${routeInput.issue.identifier}.`
        );
      }

      const session = resumed.session;
      const result = await session.receiveAsync(
        createSymphonyCurrentFlowTrackerStateObservedSignal({
          id: buildTrackerObservedSignalId(
            routeInput.issue,
            routeInput.attempt,
            routeInput.startedAt
          ),
          occurredAt: routeInput.startedAt,
          state: parseSymphonyCurrentFlowTrackerState(routeInput.issue.state),
          runId: null,
          runMode: null,
          causationId: null,
          correlationId: routeInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: ensured.workflow.workflowId,
        policy,
        result
      });

      let preparedIssue = routeInput.issue;
      let selectedRunMode: SymphonyRunMode | null = null;

      for (const command of result.decision.commands) {
        if (command.kind === "tracker.transition") {
          preparedIssue = await executeSettledRouteCommand({
            routeWorkflows: input.routeWorkflows,
            workflowId: ensured.workflow.workflowId,
            session,
            command,
            recordedAt: routeInput.startedAt,
            async execute(executedCommand) {
              return await executeTrackerTransitionCommand({
                command: executedCommand,
                issue: preparedIssue,
                tracker: input.tracker,
                trackerConfig: input.trackerConfig
              });
            }
          });
          continue;
        }

        if (command.kind === "run.dispatch") {
          selectedRunMode = await executeSettledRouteCommand({
            routeWorkflows: input.routeWorkflows,
            workflowId: ensured.workflow.workflowId,
            session,
            command,
            recordedAt: routeInput.startedAt,
            async execute(executedCommand) {
              return readDispatchRunMode(executedCommand);
            }
          });
          continue;
        }

        throw new TypeError(
          `Dispatch bootstrap router does not support command kind ${command.kind}.`
        );
      }

      selectedRunMode ??=
        resumed.projection.data.lastDispatchMode ??
        result.projectionAfter.data.lastDispatchMode;
      if (!selectedRunMode) {
        throw new TypeError(
          `Route workflow ${ensured.workflow.workflowId} did not produce a dispatch run mode for ${routeInput.issue.identifier}.`
        );
      }

      return {
        issue: preparedIssue,
        runMode: selectedRunMode
      };
    }
  };
}

async function executeTrackerTransitionCommand(input: {
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  trackerConfig: SymphonyTrackerConfig;
}) {
  const targetState = readTrackerTransitionState(input.command);
  if (targetState !== "Bootstrapping") {
    throw new TypeError(
      `Dispatch bootstrap routing only supports tracker transitions to Bootstrapping. Received ${String(targetState)}.`
    );
  }

  return await prepareIssueForDispatch(
    {
      tracker: input.trackerConfig
    },
    input.tracker,
    input.issue
  );
}

function buildTrackerObservedSignalId(
  issue: SymphonyTrackerIssue,
  attempt: number,
  startedAt: string
) {
  return [
    "signal",
    "dispatch_bootstrap",
    normalizeWorkflowToken(issue.id),
    normalizeWorkflowToken(issue.state),
    `attempt_${attempt}`,
    normalizeWorkflowToken(startedAt)
  ].join("_");
}
