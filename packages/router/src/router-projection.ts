import { Effect } from "effect";
import {
  ProjectionCorruptedError,
  UnknownNodeError,
  toWorkflowRouterError,
  type WorkflowRouterError
} from "./router-errors.js";
import type { NormalizedWorkflowRouterDefinition } from "./router-definition.js";
import type {
  WorkflowCommand,
  WorkflowHistory,
  WorkflowProjection
} from "./types/index.js";
import type { WorkflowNodeId } from "./types/base.js";

export function projectWorkflow<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  definition: NormalizedWorkflowRouterDefinition<Node, Data, Policy>;
  workflowId: string;
  history: WorkflowHistory<Node>;
  policy: Policy;
}): Effect.Effect<WorkflowProjection<Node, Data>, WorkflowRouterError, never> {
  return Effect.try({
    try: () => {
      const currentNode = input.definition.initialNode;
      let projection: WorkflowProjection<Node, Data> = {
        workflowId: input.workflowId,
        currentNode,
        pendingCommands: [],
        terminal: input.definition.nodeMap.get(currentNode)?.isTerminal() ?? false,
        sequence: 0,
        data: input.definition.createInitialData(),
        lastSignal: null,
        lastDecision: null
      };

      const pendingCommands = new Map<string, WorkflowCommand>();

      for (const event of input.history) {
        projection = {
          ...projection,
          sequence: projection.sequence + 1,
          data: input.definition.reduceData
            ? input.definition.reduceData({
                data: projection.data,
                event,
                policy: input.policy
              })
            : projection.data
        };

        switch (event.kind) {
          case "signal_recorded":
            projection = {
              ...projection,
              lastSignal: event.signal
            };
            break;
          case "decision_recorded": {
            const nextNode = event.decision.toNode ?? projection.currentNode;
            if (nextNode && !input.definition.nodeMap.has(nextNode)) {
              throw new UnknownNodeError({
                nodeId: nextNode
              });
            }

            projection = {
              ...projection,
              currentNode: nextNode,
              terminal: nextNode
                ? input.definition.nodeMap.get(nextNode)?.isTerminal() ?? false
                : false,
              lastDecision: event.decision
            };
            break;
          }
          case "command_emitted":
            pendingCommands.set(event.command.id, event.command);
            projection = {
              ...projection,
              pendingCommands: [...pendingCommands.values()]
            };
            break;
          case "command_settled":
            if (!pendingCommands.has(event.commandId)) {
              throw new ProjectionCorruptedError({
                message: `Cannot settle unknown command id ${event.commandId}.`
              });
            }

            pendingCommands.delete(event.commandId);
            projection = {
              ...projection,
              pendingCommands: [...pendingCommands.values()]
            };
            break;
        }
      }

      return projection;
    },
    catch: (error) =>
      toWorkflowRouterError(error, "Workflow projection failed.")
  });
}
