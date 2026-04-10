import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  readSymphonyCurrentFlowDispatchCommand,
  readSymphonyCurrentFlowTrackerTransitionCommand,
  type WorkflowCommand,
  type WorkflowNodeId,
  type WorkflowPayload,
  type WorkflowProjection,
  type WorkflowSession
} from "@symphony/router";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";

export async function settleRouteCommand<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: WorkflowSession<Node, Data, Policy>;
  commandId: string;
  status: "succeeded" | "failed";
  payload: WorkflowPayload;
  recordedAt: string;
}): Promise<WorkflowProjection<Node, Data>> {
  const projection = await input.session.settleCommandAsync({
    commandId: input.commandId,
    status: input.status,
    payload: input.payload,
    recordedAt: input.recordedAt
  });

  await input.routeWorkflows.appendCommandSettlement({
    workflowId: input.workflowId,
    commandId: input.commandId,
    status: input.status,
    payload: input.payload,
    recordedAt: input.recordedAt,
    projection
  });

  return projection;
}

export async function executeSettledRouteCommand<
  Node extends WorkflowNodeId,
  Data,
  Policy,
  Result,
>(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
  workflowId: string;
  session: WorkflowSession<Node, Data, Policy>;
  command: WorkflowCommand;
  recordedAt: string;
  execute(command: WorkflowCommand): Promise<Result>;
}): Promise<Result> {
  try {
    const result = await input.execute(input.command);
    await settleRouteCommand({
      routeWorkflows: input.routeWorkflows,
      workflowId: input.workflowId,
      session: input.session,
      commandId: input.command.id,
      status: "succeeded",
      payload: null,
      recordedAt: input.recordedAt
    });
    return result;
  } catch (error) {
    await settleRouteCommand({
      routeWorkflows: input.routeWorkflows,
      workflowId: input.workflowId,
      session: input.session,
      commandId: input.command.id,
      status: "failed",
      payload: {
        error: String(error)
      },
      recordedAt: input.recordedAt
    });
    throw error;
  }
}

export function normalizeWorkflowToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
}

export function readTrackerTransitionState(command: WorkflowCommand): string {
  const trackerTransition = readSymphonyCurrentFlowTrackerTransitionCommand(
    command
  );
  if (trackerTransition) {
    return trackerTransition.payload.state;
  }

  throw new TypeError(
    `Route command is not a valid Symphony current-flow tracker.transition command: ${command.kind}.`
  );
}

export function readDispatchRunMode(command: WorkflowCommand): SymphonyRunMode {
  const dispatchCommand = readSymphonyCurrentFlowDispatchCommand(command);
  if (dispatchCommand) {
    return dispatchCommand.payload.runMode;
  }

  throw new TypeError(
    `Route command is not a valid Symphony current-flow run.dispatch command: ${command.kind}.`
  );
}
