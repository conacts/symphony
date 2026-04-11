import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  type WorkflowCommand,
  type WorkflowNodeId,
  type WorkflowPayload,
  type WorkflowProjection,
  type WorkflowSession
} from "@symphony/router";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";

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

export function readTrackerTransitionState(input: {
  adapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
}): string {
  return input.adapter.readTrackerTransitionState(input.command);
}

export function readDispatchRunMode(input: {
  adapter: SymphonyRuntimeWorkflowPresetAdapter;
  command: WorkflowCommand;
}): SymphonyRunMode {
  return input.adapter.readDispatchRunMode(input.command);
}
