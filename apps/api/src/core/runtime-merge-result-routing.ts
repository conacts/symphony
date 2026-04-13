import {
  type SymphonyCurrentFlowMergeResultStatus,
  type WorkflowCommand
} from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { RuntimeMergeResult } from "@symphony/runtime-tools";
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

export type SymphonyMergeResultRoutingInput = {
  projectedIssue: SymphonyTrackerIssue;
  runId: string;
  recordedAt: string;
  mergeResult: RuntimeMergeResult;
};

export type SymphonyMergeResultRoutingResult = {
  projectedIssue: SymphonyTrackerIssue;
};

export type SymphonyMergeResultRouter = {
  routeMergeResult(
    input: SymphonyMergeResultRoutingInput
  ): Promise<SymphonyMergeResultRoutingResult>;
};

export async function createRuntimeMergeResultRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}): Promise<SymphonyMergeResultRouter> {
  return {
    async routeMergeResult(
      mergeResultInput
    ): Promise<SymphonyMergeResultRoutingResult> {
      const loaded = await input.sessionLoader.resumeByTrackerIssueKey({
        trackerIssueKey: mergeResultInput.projectedIssue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${mergeResultInput.projectedIssue.identifier} during merge-result routing.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;

      const result = await resumed.session.receiveAsync(
        presetAdapter.createMergeResultReportedSignal({
          id: buildMergeResultReportedSignalId({
            projectedIssue: mergeResultInput.projectedIssue,
            status: mergeResultInput.mergeResult.status,
            recordedAt: mergeResultInput.recordedAt
          }),
          occurredAt: mergeResultInput.recordedAt,
          runId: mergeResultInput.runId,
          mergeResult: mergeResultInput.mergeResult,
          causationId: mergeResultInput.runId,
          correlationId: mergeResultInput.projectedIssue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      const routedIssue = await executeMergeResultCommands({
        commands: result.decision.commands,
        projectedIssue: mergeResultInput.projectedIssue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        loadSettlementSession: createRouteCommandSettlementSessionLoader({
          sessionLoader: input.sessionLoader,
          workflowId: resumed.hydrationState.workflow.workflowId,
          failureContext: "while settling merge-result route commands"
        }),
        recordedAt: mergeResultInput.recordedAt,
        presetAdapter,
        status: mergeResultInput.mergeResult.status
      });

      return {
        projectedIssue: routedIssue
      };
    }
  };
}

async function executeMergeResultCommands(input: {
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
  status: SymphonyCurrentFlowMergeResultStatus;
}): Promise<SymphonyTrackerIssue> {
  let currentProjectedIssue = input.projectedIssue;

  for (const command of input.commands) {
    if (command.kind !== "tracker.transition") {
      throw new TypeError(
        `Merge-result routing does not support command kind ${command.kind}.`
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
        return await executeMergeResultTrackerTransition({
          presetAdapter: input.presetAdapter,
          command: executedCommand,
          projectedIssue: currentProjectedIssue,
          tracker: input.tracker,
          status: input.status
        });
      }
    });
  }

  return currentProjectedIssue;
}

async function executeMergeResultTrackerTransition(input: {
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
  projectedIssue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  status: SymphonyCurrentFlowMergeResultStatus;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState({
    adapter: input.presetAdapter,
    command: input.command
  });
  const expectedTargetState = input.status === "merged" ? "Done" : "Blocked";

  if (targetState !== expectedTargetState) {
    throw new TypeError(
      `Merge-result routing only supports tracker transitions to ${expectedTargetState} for ${input.status} merge results. Received ${String(targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.projectedIssue.id, targetState);
  return {
    ...input.projectedIssue,
    state: targetState
  };
}

function buildMergeResultReportedSignalId(input: {
  projectedIssue: SymphonyTrackerIssue;
  status: SymphonyCurrentFlowMergeResultStatus;
  recordedAt: string;
}) {
  return [
    "signal",
    "merge_result_reported",
    normalizeWorkflowToken(input.projectedIssue.id),
    normalizeWorkflowToken(input.status),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
