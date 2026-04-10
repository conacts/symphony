import { Effect } from "effect";
import {
  AmbiguousTransitionError
} from "./router-errors.js";
import type {
  RouterStrategy,
  WorkflowCandidateEdge,
  WorkflowRouteSelection
} from "./router-strategy.js";
import type { WorkflowNodeId } from "./types/base.js";

export function createDeterministicStrategy<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(): RouterStrategy<Node, Data, Policy> {
  return {
    kind: "deterministic",
    select(input) {
      if (input.candidates.length === 0) {
        return Effect.succeed<WorkflowRouteSelection>({
          edgeId: null,
          reasonCode: "no_matching_edge"
        });
      }

      const sorted = [...input.candidates].sort(
        (left, right) => right.edge.priority - left.edge.priority
      );
      const highestPriority = sorted[0]?.edge.priority ?? 0;
      const highestPriorityEdges = sorted.filter(
        (candidate) => candidate.edge.priority === highestPriority
      );

      if (highestPriorityEdges.length > 1) {
        return Effect.fail(
          new AmbiguousTransitionError({
            currentNode: input.projection.currentNode,
            edgeIds: highestPriorityEdges.map((candidate) => candidate.edge.id)
          })
        );
      }

      const selected = highestPriorityEdges[0];
      if (!selected) {
        return Effect.succeed<WorkflowRouteSelection>({
          edgeId: null,
          reasonCode: "no_matching_edge"
        });
      }

      return Effect.succeed<WorkflowRouteSelection>({
        edgeId: selected.edge.id,
        reasonCode: selected.edge.reasonCode,
        metadata: {
          strategy: "deterministic",
          priority: selected.edge.priority
        }
      });
    }
  };
}

export type DeterministicCandidateEdge<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = WorkflowCandidateEdge<Node, Data, Policy>;
