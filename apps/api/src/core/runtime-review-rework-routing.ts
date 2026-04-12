import { type WorkflowCommand } from "@symphony/router";
import type { SymphonyReworkHandoff } from "@symphony/runtime-contract";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyTrackerStateDispatchRequest } from "./runtime-tracker-state-observation-routing.js";
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

export type SymphonyReviewReworkRoutingInput = {
  observedTrackerIssue: SymphonyTrackerIssue;
  recordedAt: string;
  handoff: SymphonyReworkHandoff;
  onDispatchRequested?(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<void> | void;
};

export type SymphonyReviewReworkRoutingResult = {
  observedTrackerIssue: SymphonyTrackerIssue;
};

export type SymphonyReviewReworkRouter = {
  routeReviewRework(
    input: SymphonyReviewReworkRoutingInput
  ): Promise<SymphonyReviewReworkRoutingResult>;
};

export async function createRuntimeReviewReworkRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}): Promise<SymphonyReviewReworkRouter> {
  return {
    async routeReviewRework(
      reviewInput
    ): Promise<SymphonyReviewReworkRoutingResult> {
      const loaded = await input.sessionLoader.resumeByIssueIdentifier({
        issueIdentifier: reviewInput.observedTrackerIssue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${reviewInput.observedTrackerIssue.identifier} during review rework routing.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;

      const result = await resumed.session.receiveAsync(
        presetAdapter.createReviewReworkRequestedSignal({
          id: buildReviewReworkRequestedSignalId({
            observedTrackerIssue: reviewInput.observedTrackerIssue,
            handoff: reviewInput.handoff,
            recordedAt: reviewInput.recordedAt
          }),
          occurredAt: reviewInput.recordedAt,
          handoff: reviewInput.handoff,
          causationId: reviewInput.observedTrackerIssue.identifier,
          correlationId: reviewInput.observedTrackerIssue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      const routedIssue = await executeReviewReworkCommands({
        commands: result.decision.commands,
        observedTrackerIssue: reviewInput.observedTrackerIssue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        loadSettlementSession: createRouteCommandSettlementSessionLoader({
          sessionLoader: input.sessionLoader,
          workflowId: resumed.hydrationState.workflow.workflowId,
          failureContext: "while settling review-rework route commands"
        }),
        recordedAt: reviewInput.recordedAt,
        presetAdapter,
        onDispatchRequested: reviewInput.onDispatchRequested
      });

      return {
        observedTrackerIssue: routedIssue
      };
    }
  };
}

async function executeReviewReworkCommands(input: {
  commands: WorkflowCommand[];
  observedTrackerIssue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>;
  loadSettlementSession: () => Promise<
    SymphonyRuntimeWorkflowSettlementSession<string, unknown, unknown>
  >;
  recordedAt: string;
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  onDispatchRequested?(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<void> | void;
}): Promise<SymphonyTrackerIssue> {
  let currentObservedTrackerIssue = input.observedTrackerIssue;

  for (const command of input.commands) {
    if (command.kind === "tracker.transition") {
      currentObservedTrackerIssue = await executeSettledRouteCommand({
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
            issue: currentObservedTrackerIssue,
            tracker: input.tracker
          });
        }
      });
      continue;
    }

    if (command.kind === "run.dispatch") {
      await executeSettledRouteCommand({
        routeWorkflows: input.routeWorkflows,
        workflowId: input.workflowId,
        session: input.session,
        loadSettlementSession: input.loadSettlementSession,
        command,
        recordedAt: input.recordedAt,
        async execute(executedCommand) {
          if (!input.onDispatchRequested) {
            throw new TypeError(
              "Review rework routing emitted run.dispatch without a dispatch callback."
            );
          }

          await input.onDispatchRequested({
            workflowId: input.workflowId,
            commandId: executedCommand.id,
            trackerIssue: currentObservedTrackerIssue,
            runMode: readDispatchRunMode({
              adapter: input.presetAdapter,
              command: executedCommand
            }),
            recordedAt: input.recordedAt
          });
        }
      });
      continue;
    }

    throw new TypeError(
      `Review rework routing does not support command kind ${command.kind}.`
    );
  }

  return currentObservedTrackerIssue;
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
  if (targetState !== "Rework" && targetState !== "Bootstrapping") {
    throw new TypeError(
      `Review rework routing only supports tracker transitions to Rework or Bootstrapping. Received ${String(targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildReviewReworkRequestedSignalId(input: {
  observedTrackerIssue: SymphonyTrackerIssue;
  handoff: SymphonyReworkHandoff;
  recordedAt: string;
}) {
  return [
    "signal",
    "review_rework_requested",
    normalizeWorkflowToken(input.observedTrackerIssue.id),
    normalizeWorkflowToken(input.handoff.triggerKind),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
