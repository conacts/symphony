import type {
  WorkflowNodeId,
  WorkflowSession
} from "@symphony/router";

export type SymphonyRuntimeWorkflowSettlementSession<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
  Policy = unknown,
> = Pick<WorkflowSession<Node, Data, Policy>, "workflowId" | "settleCommandAsync">;

export type SymphonyRuntimeWorkflowReceiveSession<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
  Policy = unknown,
> = SymphonyRuntimeWorkflowSettlementSession<Node, Data, Policy> &
  Pick<WorkflowSession<Node, Data, Policy>, "receiveAsync">;
