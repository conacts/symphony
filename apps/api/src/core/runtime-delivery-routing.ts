import { type WorkflowCommand, type WorkflowSession } from "@symphony/router";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";
import type { SymphonyTrackerStateDispatchRequest } from "./runtime-tracker-state-observation-routing.js";
import {
  createRouteCommandSettlementSessionLoader,
  executeSettledRouteCommand,
  normalizeWorkflowToken,
  readDispatchRunMode,
  readTrackerTransitionState
} from "./runtime-route-workflow-command-utils.js";

export type SymphonyDeliveryStatus = "completed" | "blocked" | "partial";

export type SymphonyDeliveryRoutingInput = {
  issue: SymphonyTrackerIssue;
  runId: string;
  recordedAt: string;
  status: SymphonyDeliveryStatus;
  onDispatchRequested?(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<void> | void;
};

export type SymphonyDeliveryRoutingResult = {
  issue: SymphonyTrackerIssue;
};

export type SymphonyDeliveryRouter = {
  routeDelivery(
    input: SymphonyDeliveryRoutingInput
  ): Promise<SymphonyDeliveryRoutingResult>;
};

export async function createRuntimeDeliveryRouter(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}): Promise<SymphonyDeliveryRouter> {
  return {
    async routeDelivery(
      deliveryInput
    ): Promise<SymphonyDeliveryRoutingResult> {
      const loaded = await input.sessionLoader.resumeByIssueIdentifier({
        issueIdentifier: deliveryInput.issue.identifier
      });
      if (!loaded) {
        throw new TypeError(
          `Route workflow could not be resumed for ${deliveryInput.issue.identifier} during delivery routing.`
        );
      }
      const { resumed } = loaded;
      const presetAdapter = loaded.routing.module.runtimeAdapter;

      const result = await resumed.session.receiveAsync(
        presetAdapter.createDeliveryReportedSignal({
          id: buildDeliveryReportedSignalId({
            issue: deliveryInput.issue,
            status: deliveryInput.status,
            recordedAt: deliveryInput.recordedAt
          }),
          occurredAt: deliveryInput.recordedAt,
          runId: deliveryInput.runId,
          status: deliveryInput.status,
          causationId: deliveryInput.runId,
          correlationId: deliveryInput.issue.identifier
        })
      );

      await input.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: loaded.routing.policy,
        result
      });

      const routedIssue = await executeDeliveryCommands({
        commands: result.decision.commands,
        issue: deliveryInput.issue,
        tracker: input.tracker,
        routeWorkflows: input.routeWorkflows,
        workflowId: resumed.hydrationState.workflow.workflowId,
        session: resumed.session,
        loadSettlementSession: createRouteCommandSettlementSessionLoader({
          sessionLoader: input.sessionLoader,
          workflowId: resumed.hydrationState.workflow.workflowId,
          failureContext: "while settling delivery route commands"
        }),
        recordedAt: deliveryInput.recordedAt,
        presetAdapter,
        status: deliveryInput.status,
        onDispatchRequested: deliveryInput.onDispatchRequested
      });

      return {
        issue: routedIssue
      };
    }
  };
}

async function executeDeliveryCommands(input: {
  commands: WorkflowCommand[];
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: WorkflowSession<string, unknown, unknown>;
  loadSettlementSession: () => Promise<WorkflowSession<string, unknown, unknown>>;
  recordedAt: string;
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  status: SymphonyDeliveryStatus;
  onDispatchRequested?(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<void> | void;
}): Promise<SymphonyTrackerIssue> {
  let currentIssue = input.issue;

  for (const command of input.commands) {
    if (command.kind === "tracker.transition") {
      currentIssue = await executeSettledRouteCommand({
        routeWorkflows: input.routeWorkflows,
        workflowId: input.workflowId,
        session: input.session,
        loadSettlementSession: input.loadSettlementSession,
        command,
        recordedAt: input.recordedAt,
        async execute(executedCommand) {
          return await executeDeliveryTrackerTransition({
            presetAdapter: input.presetAdapter,
            command: executedCommand,
            issue: currentIssue,
            tracker: input.tracker,
            status: input.status
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
          if (input.status !== "completed") {
            throw new TypeError(
              `Delivery routing only supports run.dispatch for completed delivery reports. Received ${input.status}.`
            );
          }

          const runMode = readDispatchRunMode({
            adapter: input.presetAdapter,
            command: executedCommand
          });
          if (runMode !== "approved_merge") {
            throw new TypeError(
              `Delivery routing only supports run.dispatch approved_merge for completed delivery reports. Received ${runMode}.`
            );
          }

          if (!input.onDispatchRequested) {
            throw new TypeError(
              "Delivery routing emitted run.dispatch without a dispatch callback."
            );
          }

          await input.onDispatchRequested({
            workflowId: input.workflowId,
            commandId: executedCommand.id,
            issue: currentIssue,
            runMode,
            recordedAt: input.recordedAt
          });
        }
      });
      continue;
    }

    {
      throw new TypeError(
        `Delivery routing does not support command kind ${command.kind}.`
      );
    }
  }

  return currentIssue;
}

async function executeDeliveryTrackerTransition(input: {
  presetAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
  issue: SymphonyTrackerIssue;
  tracker: SymphonyTracker;
  status: SymphonyDeliveryStatus;
}): Promise<SymphonyTrackerIssue> {
  const targetState = readTrackerTransitionState({
    adapter: input.presetAdapter,
    command: input.command
  });
  const expectedTargetStates =
    input.status === "completed"
      ? ["In Review", "Approved"]
      : input.status === "blocked"
        ? ["Blocked"]
        : [];

  if (expectedTargetStates.length === 0) {
    throw new TypeError(
      `Delivery routing only supports explicit tracker transitions for completed or blocked delivery statuses. Received ${input.status}.`
    );
  }

  if (!expectedTargetStates.includes(targetState)) {
    throw new TypeError(
      `Delivery routing only supports tracker transitions to ${expectedTargetStates.join(" or ")} for ${input.status} delivery reports. Received ${String(targetState)}.`
    );
  }

  await input.tracker.updateIssueState(input.issue.id, targetState);
  return {
    ...input.issue,
    state: targetState
  };
}

function buildDeliveryReportedSignalId(input: {
  issue: SymphonyTrackerIssue;
  status: SymphonyDeliveryStatus;
  recordedAt: string;
}) {
  return [
    "signal",
    "delivery_reported",
    normalizeWorkflowToken(input.issue.id),
    normalizeWorkflowToken(input.status),
    normalizeWorkflowToken(input.recordedAt)
  ].join("_");
}
