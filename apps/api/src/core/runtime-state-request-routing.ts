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
  normalizeWorkflowToken,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export type SymphonyRuntimeStateRequestRoutingInput = {
  projectedIssue: SymphonyTrackerIssue;
  runId: string;
  recordedAt: string;
  requestKind: string;
  targetState: string;
};

export type SymphonyRuntimeStateRequestRoutingResult = {
  projectedIssue: SymphonyTrackerIssue;
};

export type SymphonyRuntimeStateRequestRouter = {
  routeStateRequest(
    input: SymphonyRuntimeStateRequestRoutingInput
  ): Promise<SymphonyRuntimeStateRequestRoutingResult>;
};

export async function createRuntimeStateRequestRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}): Promise<SymphonyRuntimeStateRequestRouter> {
  return {
    async routeStateRequest(
      stateRequestInput
    ): Promise<SymphonyRuntimeStateRequestRoutingResult> {
      const loaded = await input.sessionLoader.resumeByTrackerIssueKey({
        trackerIssueKey: stateRequestInput.projectedIssue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${stateRequestInput.projectedIssue.identifier} during runtime state-request routing.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;

      const result = await resumed.session.receiveAsync(
        presetAdapter.createStateRequestedSignal({
          id: buildStateRequestedSignalId({
            projectedIssue: stateRequestInput.projectedIssue,
            requestKind: stateRequestInput.requestKind,
            targetState: stateRequestInput.targetState,
            recordedAt: stateRequestInput.recordedAt
          }),
          occurredAt: stateRequestInput.recordedAt,
          runId: stateRequestInput.runId,
          requestKind: stateRequestInput.requestKind,
          targetState: stateRequestInput.targetState,
          causationId: stateRequestInput.runId,
          correlationId: stateRequestInput.projectedIssue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      const routedIssue = await executeRequestedStateCommands({
        commands: result.decision.commands,
        projectedIssue: stateRequestInput.projectedIssue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        loadSettlementSession: createRouteCommandSettlementSessionLoader({
          sessionLoader: input.sessionLoader,
          workflowId: resumed.hydrationState.workflow.workflowId,
          failureContext:
            "while settling runtime state-request route commands"
        }),
        recordedAt: stateRequestInput.recordedAt,
        presetAdapter,
        targetState: stateRequestInput.targetState
      });

      return {
        projectedIssue: routedIssue
      };
    }
  };
}

async function executeRequestedStateCommands(input: {
  commands: WorkflowCommand[];
  projectedIssue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>;
  loadSettlementSession: () => Promise<
    SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>
  >;
  recordedAt: string;
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  targetState: string;
}): Promise<SymphonyTrackerIssue> {
  let currentProjectedIssue = input.projectedIssue;

  for (const command of input.commands) {
    if (command.kind !== "tracker.transition") {
      throw new TypeError(
        `Runtime state-request routing does not support command kind ${command.kind}.`
      );
    }

    currentProjectedIssue = await executeSettledRouteCommand({
      routeWorkflows: input.routeWorkflows,
      workflowId: input.workflowId,
      session: input.session,
      loadSettlementSession: input.loadSettlementSession,
      command,
      recordedAt: input.recordedAt,
      async execute(executedCommand) {
        return await executeRequestedTrackerTransition({
          presetAdapter: input.presetAdapter,
          command: executedCommand,
          projectedIssue: currentProjectedIssue,
          tracker: input.tracker,
          targetState: input.targetState
        });
      }
    });
  }

  return currentProjectedIssue;
}

async function executeRequestedTrackerTransition(input: {
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
  projectedIssue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  targetState: string;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState({
    adapter: input.presetAdapter,
    command: input.command
  });
  if (targetState !== input.targetState) {
    throw new TypeError(
      `Runtime state-request routing expected tracker transition to ${input.targetState}. Received ${String(targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.projectedIssue.id, targetState);
  return {
    ...input.projectedIssue,
    state: targetState
  };
}

function buildStateRequestedSignalId(input: {
  projectedIssue: SymphonyTrackerIssue;
  requestKind: string;
  targetState: string;
  recordedAt: string;
}) {
  return [
    "signal",
    "state_requested",
    normalizeWorkflowToken(input.projectedIssue.id),
    normalizeWorkflowToken(input.requestKind),
    normalizeWorkflowToken(input.targetState),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
