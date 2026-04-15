import type {
  SymphonyRunStartActivationInput,
  SymphonyRunStartActivationResult
} from "@symphony/orchestrator";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
  createRouteCommandSettlementSessionLoader,
  executeSettledTrackerTransitionCommand,
  normalizeWorkflowToken,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export async function createRuntimeRunStartActivationRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}) {
  return {
    async activate(
      activationInput: SymphonyRunStartActivationInput
    ): Promise<SymphonyRunStartActivationResult> {
      return await activateRuntimeRunStart({
        routeWorkflows: input.routeWorkflows,
        tracker: input.tracker,
        sessionLoader: input.sessionLoader,
        activationInput
      });
    }
  };
}

export async function activateRuntimeRunStart(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  activationInput: SymphonyRunStartActivationInput;
  signalId?: string;
  causationId?: string | null;
  correlationId?: string | null;
  settlementFailureContext?: string;
}): Promise<SymphonyRunStartActivationResult> {
  const loaded = await input.sessionLoader.resumeByIssueIdentifier({
    issueIdentifier: input.activationInput.issue.identifier
  });
  if (!loaded) {
    throw new TypeError(
      `Route workflow could not be resumed for ${input.activationInput.issue.identifier} at run start.`
    );
  }
  const { resumed } = loaded;
  const presetAdapter = loaded.routing.module.runtimeAdapter;

  const result = await resumed.session.receiveAsync(
    presetAdapter.createRunStartedSignal({
      id:
        input.signalId ??
        buildRunStartedSignalId({
          issue: input.activationInput.issue,
          runMode: input.activationInput.runMode,
          recordedAt: input.activationInput.recordedAt
        }),
      occurredAt: input.activationInput.recordedAt,
      runId: input.activationInput.runId,
      runMode: input.activationInput.runMode,
      causationId: input.causationId ?? input.activationInput.runId,
      correlationId:
        input.correlationId ?? input.activationInput.issue.identifier
    })
  );

  await input.routeWorkflows.recordRouteResult({
    workflowId: resumed.hydrationState.workflow.workflowId,
    policy: loaded.routing.policy,
    result
  });

  let activatedIssue = input.activationInput.issue;
  const loadSettlementSession = createRouteCommandSettlementSessionLoader({
    sessionLoader: input.sessionLoader,
    workflowId: resumed.hydrationState.workflow.workflowId,
    failureContext:
      input.settlementFailureContext ??
      "while settling run-start activation route commands"
  });
  for (const command of result.decision.commands) {
    if (command.kind === "tracker.transition") {
      activatedIssue = await executeSettledTrackerTransitionCommand({
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        loadSettlementSession,
        command,
        recordedAt: input.activationInput.recordedAt,
        issue: activatedIssue,
        tracker: input.tracker,
        readTargetState(executedCommand) {
          return readTrackerTransitionState({
            adapter: presetAdapter,
            command: executedCommand
          });
        },
        async executeTransition({ issue, tracker, targetState }) {
          return await executeInProgressTransition({
            issue,
            tracker,
            targetState
          });
        }
      });
      continue;
    }

    throw new TypeError(
      `Run start activation router does not support command kind ${command.kind}.`
    );
  }

  return {
    issue: activatedIssue
  };
}

async function executeInProgressTransition(input: {
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  targetState: string;
}): Promise<SymphonyTrackerIssue> {
  if (input.targetState !== "In Progress") {
    throw new TypeError(
      `Run start activation only supports tracker transitions to In Progress. Received ${String(input.targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.issue.id, input.targetState);
  return {
    ...input.issue,
    state: input.targetState
  };
}

function buildRunStartedSignalId(input: {
  issue: SymphonyTrackerIssue;
  runMode: string;
  recordedAt: string;
}) {
  return [
    "signal",
    "run_started",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.runMode),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
