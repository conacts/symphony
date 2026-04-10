import type {
  WorkflowNodeId,
  WorkflowPayload,
  WorkflowProjection,
  WorkflowSession
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
  payload?: WorkflowPayload;
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

export function normalizeWorkflowToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
}

export function readTrackerTransitionState(payload: WorkflowPayload): string | null {
  if (payload === null) {
    return null;
  }

  const state = payload["state"];
  return typeof state === "string" ? state : null;
}
