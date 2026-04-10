import {
  prepareIssueForDispatch,
  type SymphonyDispatchBootstrapRouter,
  type SymphonyDispatchBootstrapRoutingResult
} from "@symphony/orchestrator";
import {
  createSymphonyCurrentFlowRouterAsync,
  type SymphonyCurrentFlowPolicy,
  type WorkflowCommand,
  type WorkflowPayload
} from "@symphony/router";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type {
  SymphonyTracker,
  SymphonyTrackerConfig,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
  normalizeWorkflowToken,
  readTrackerTransitionState,
  settleRouteCommand
} from "./runtime-route-workflow-command-utils.js";

const symphonyCurrentFlowPolicy: SymphonyCurrentFlowPolicy = {};

export async function createRuntimeDispatchBootstrapRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  trackerConfig: SymphonyTrackerConfig;
  repositoryKey: string;
  now?: () => Date;
}) : Promise<SymphonyDispatchBootstrapRouter> {
  const router = await createSymphonyCurrentFlowRouterAsync({
    now: input.now
  });

  return {
    async route(routeInput): Promise<SymphonyDispatchBootstrapRoutingResult> {
      const ensured = await input.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: routeInput.issue.identifier,
        repositoryKey: input.repositoryKey,
        router,
        createdAt: routeInput.startedAt
      });
      const resumed = await input.routeWorkflows.resumeSessionByWorkflowId({
        workflowId: ensured.workflow.workflowId,
        router,
        policy: symphonyCurrentFlowPolicy
      });

      if (!resumed) {
        throw new TypeError(
          `Route workflow ${ensured.workflow.workflowId} could not be resumed for ${routeInput.issue.identifier}.`
        );
      }

      const session = resumed.session;
      const result = await session.receiveAsync({
        id: buildTrackerObservedSignalId(routeInput.issue, routeInput.attempt, routeInput.startedAt),
        type: "tracker.state_observed",
        source: "tracker",
        occurredAt: routeInput.startedAt,
        payload: {
          state: routeInput.issue.state,
          attempt: routeInput.attempt,
          preferredWorkerHost: routeInput.preferredWorkerHost
        },
        causationId: null,
        correlationId: routeInput.issue.identifier
      });

      await input.routeWorkflows.recordRouteResult({
        workflowId: ensured.workflow.workflowId,
        policy: symphonyCurrentFlowPolicy,
        result
      });

      let preparedIssue = routeInput.issue;
      let selectedRunMode: SymphonyRunMode | null = null;

      for (const command of result.decision.commands) {
        if (command.kind === "tracker.transition") {
          try {
            preparedIssue = await executeTrackerTransitionCommand({
              command,
              issue: preparedIssue,
              tracker: input.tracker,
              trackerConfig: input.trackerConfig
            });
            await settleRouteCommand({
              routeWorkflows: input.routeWorkflows,
              workflowId: ensured.workflow.workflowId,
              session,
              commandId: command.id,
              status: "succeeded",
              recordedAt: routeInput.startedAt
            });
          } catch (error) {
            await settleRouteCommand({
              routeWorkflows: input.routeWorkflows,
              workflowId: ensured.workflow.workflowId,
              session,
              commandId: command.id,
              status: "failed",
              payload: {
                error: String(error)
              },
              recordedAt: routeInput.startedAt
            });
            throw error;
          }
          continue;
        }

        if (command.kind === "run.dispatch") {
          selectedRunMode = readDispatchRunMode(command.payload);
          if (!selectedRunMode) {
            await settleRouteCommand({
              routeWorkflows: input.routeWorkflows,
              workflowId: ensured.workflow.workflowId,
              session,
              commandId: command.id,
              status: "failed",
              payload: {
                error: "missing_run_mode"
              },
              recordedAt: routeInput.startedAt
            });
            throw new TypeError(
              `Dispatch command ${command.id} is missing a run mode.`
            );
          }

          await settleRouteCommand({
            routeWorkflows: input.routeWorkflows,
            workflowId: ensured.workflow.workflowId,
            session,
            commandId: command.id,
            status: "succeeded",
            recordedAt: routeInput.startedAt
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
  const targetState = readTrackerTransitionState(input.command.payload);
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

function readDispatchRunMode(payload: WorkflowPayload): SymphonyRunMode | null {
  if (payload === null) {
    return null;
  }

  const runMode = payload["runMode"];
  return runMode === "implementation" ||
    runMode === "rework" ||
    runMode === "approved_merge"
    ? runMode
    : null;
}
