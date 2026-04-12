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
  issue: SymphonyTrackerIssue;
  runId: string;
  recordedAt: string;
  mergeResult: RuntimeMergeResult;
};

export type SymphonyMergeResultRoutingResult = {
  issue: SymphonyTrackerIssue;
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
      const loaded = await input.sessionLoader.resumeByIssueIdentifier({
        issueIdentifier: mergeResultInput.issue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${mergeResultInput.issue.identifier} during merge-result routing.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;

      const result = await resumed.session.receiveAsync(
        presetAdapter.createMergeResultReportedSignal({
          id: buildMergeResultReportedSignalId({
            issue: mergeResultInput.issue,
            status: mergeResultInput.mergeResult.status,
            recordedAt: mergeResultInput.recordedAt
          }),
          occurredAt: mergeResultInput.recordedAt,
          runId: mergeResultInput.runId,
          mergeResult: mergeResultInput.mergeResult,
          causationId: mergeResultInput.runId,
          correlationId: mergeResultInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      const routedIssue = await executeMergeResultCommands({
        commands: result.decision.commands,
        issue: mergeResultInput.issue,
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
        issue: routedIssue
      };
    }
  };
}

async function executeMergeResultCommands(input: {
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
  status: SymphonyCurrentFlowMergeResultStatus;
}): Promise<SymphonyTrackerIssue> {
  let currentIssue = input.issue;

  for (const command of input.commands) {
    if (command.kind !== "tracker.transition") {
      throw new TypeError(
        `Merge-result routing does not support command kind ${command.kind}.`
      );
    }

    currentIssue = await executeSettledRouteCommand({
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
          issue: currentIssue,
          tracker: input.tracker,
          status: input.status
        });
      }
    });
  }

  return currentIssue;
}

async function executeMergeResultTrackerTransition(input: {
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
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

  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildMergeResultReportedSignalId(input: {
  issue: SymphonyTrackerIssue;
  status: SymphonyCurrentFlowMergeResultStatus;
  recordedAt: string;
}) {
  return [
    "signal",
    "merge_result_reported",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.status),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
