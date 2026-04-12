import { Effect } from "effect";
import {
  InvalidRouterDefinitionError,
  toWorkflowRouterError
} from "./router-errors.js";
import type { WorkflowEdge } from "./router-edge.js";
import type { WorkflowNode } from "./router-node.js";
import type { RouterStrategy } from "./router-strategy.js";
import type {
  WorkflowJournalEvent,
  WorkflowProjection
} from "./types/index.js";
import type { WorkflowNodeId } from "./types/base.js";

export type WorkflowDataReducer<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = (input: {
  data: Data;
  event: WorkflowJournalEvent<Node>;
  projection: WorkflowProjection<Node, Data>;
  policy: Policy;
}) => Data;

export type WorkflowRouterDefinition<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = {
  name: string;
  version: string;
  initialNode: Node;
  nodes: ReadonlyArray<WorkflowNode<Node, Data, Policy>>;
  edges: ReadonlyArray<WorkflowEdge<Node, Data, Policy>>;
  strategy: RouterStrategy<Node, Data, Policy>;
  createInitialData(): Data;
  reduceData?: WorkflowDataReducer<Node, Data, Policy>;
};

export type NormalizedWorkflowRouterDefinition<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = WorkflowRouterDefinition<Node, Data, Policy> & {
  nodeMap: ReadonlyMap<Node, WorkflowNode<Node, Data, Policy>>;
  edgeMap: ReadonlyMap<string, WorkflowEdge<Node, Data, Policy>>;
};

export function validateWorkflowRouterDefinition<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(
  definition: WorkflowRouterDefinition<Node, Data, Policy>
): Effect.Effect<
  NormalizedWorkflowRouterDefinition<Node, Data, Policy>,
  InvalidRouterDefinitionError,
  never
> {
  return Effect.try({
    try: () => {
      const name = normalizeRequiredText(definition.name, "router name");
      const version = normalizeRequiredText(definition.version, "router version");
      const initialNode = normalizeRequiredText(
        definition.initialNode,
        "router initialNode"
      ) as Node;

      const nodeMap = new Map<Node, WorkflowNode<Node, Data, Policy>>();
      for (const node of definition.nodes) {
        if (nodeMap.has(node.id)) {
          throw new InvalidRouterDefinitionError({
            message: `Duplicate router node id: ${node.id}.`,
            detail: {
              nodeId: node.id
            }
          });
        }

        nodeMap.set(node.id, node);
      }

      if (!nodeMap.has(initialNode)) {
        throw new InvalidRouterDefinitionError({
          message: `Initial node ${initialNode} does not exist in the router definition.`,
          detail: {
            initialNode
          }
        });
      }

      const edgeMap = new Map<string, WorkflowEdge<Node, Data, Policy>>();
      for (const edge of definition.edges) {
        if (edgeMap.has(edge.id)) {
          throw new InvalidRouterDefinitionError({
            message: `Duplicate router edge id: ${edge.id}.`,
            detail: {
              edgeId: edge.id
            }
          });
        }

        if (edge.from !== "*" && !nodeMap.has(edge.from)) {
          throw new InvalidRouterDefinitionError({
            message: `Edge ${edge.id} references unknown from-node ${edge.from}.`,
            detail: {
              edgeId: edge.id,
              from: edge.from
            }
          });
        }

        if (!nodeMap.has(edge.to)) {
          throw new InvalidRouterDefinitionError({
            message: `Edge ${edge.id} references unknown to-node ${edge.to}.`,
            detail: {
              edgeId: edge.id,
              to: edge.to
            }
          });
        }

        edgeMap.set(edge.id, edge);
      }

      return {
        ...definition,
        name,
        version,
        initialNode,
        nodeMap,
        edgeMap
      };
    },
    catch: (error) =>
      toWorkflowRouterError(
        error,
        "Workflow router definition validation failed."
      ) as InvalidRouterDefinitionError
  });
}

function normalizeRequiredText(value: string, subject: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new InvalidRouterDefinitionError({
      message: `${subject} is required.`
    });
  }

  return normalized;
}
