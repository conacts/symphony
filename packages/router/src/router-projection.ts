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
      return applyWorkflowHistory({
        definition: input.definition,
        projection: createInitialProjection({
          definition: input.definition,
          workflowId: input.workflowId
        }),
        history: input.history,
        policy: input.policy
      });
    },
    catch: (error) =>
      toWorkflowRouterError(error, "Workflow projection failed.")
  });
}

export function rehydrateWorkflowProjection<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  definition: NormalizedWorkflowRouterDefinition<Node, Data, Policy>;
  projection: WorkflowProjection<Node, Data>;
  tailHistory: WorkflowHistory<Node>;
  policy: Policy;
}): Effect.Effect<WorkflowProjection<Node, Data>, WorkflowRouterError, never> {
  return Effect.try({
    try: () =>
      applyWorkflowHistory({
        definition: input.definition,
        projection: cloneProjection(input.projection),
        history: input.tailHistory,
        policy: input.policy
      }),
    catch: (error) =>
      toWorkflowRouterError(error, "Workflow projection rehydration failed.")
  });
}

function createInitialProjection<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  definition: NormalizedWorkflowRouterDefinition<Node, Data, Policy>;
  workflowId: string;
}): WorkflowProjection<Node, Data> {
  const currentNode = input.definition.initialNode;

  return {
    workflowId: input.workflowId,
    currentNode,
    pendingCommands: [],
    recordedSignalIds: [],
    emittedCommandIds: [],
    terminal: input.definition.nodeMap.get(currentNode)?.isTerminal() ?? false,
    sequence: 0,
    data: input.definition.createInitialData(),
    lastSignal: null,
    lastDecision: null
  };
}

function applyWorkflowHistory<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  definition: NormalizedWorkflowRouterDefinition<Node, Data, Policy>;
  projection: WorkflowProjection<Node, Data>;
  history: WorkflowHistory<Node>;
  policy: Policy;
}): WorkflowProjection<Node, Data> {
  validateProjectionCheckpoint({
    definition: input.definition,
    projection: input.projection
  });

  let projection = cloneProjection(input.projection);
  const pendingCommands = buildPendingCommandMap(projection.pendingCommands);
  const recordedSignalIds = new Set<string>(projection.recordedSignalIds);
  const emittedCommandIds = new Set<string>(projection.emittedCommandIds);

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
        if (event.signal.id) {
          if (recordedSignalIds.has(event.signal.id)) {
            throw new ProjectionCorruptedError({
              message: `Duplicate recorded signal id ${event.signal.id}.`
            });
          }

          recordedSignalIds.add(event.signal.id);
        }
        projection = {
          ...projection,
          recordedSignalIds: [...recordedSignalIds],
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
        if (emittedCommandIds.has(event.command.id)) {
          throw new ProjectionCorruptedError({
            message: `Duplicate emitted command id ${event.command.id}.`
          });
        }

        emittedCommandIds.add(event.command.id);
        pendingCommands.set(event.command.id, event.command);
        projection = {
          ...projection,
          emittedCommandIds: [...emittedCommandIds],
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
}

function validateProjectionCheckpoint<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  definition: NormalizedWorkflowRouterDefinition<Node, Data, Policy>;
  projection: WorkflowProjection<Node, Data>;
}) {
  const currentNode = input.projection.currentNode;
  if (currentNode && !input.definition.nodeMap.has(currentNode)) {
    throw new UnknownNodeError({
      nodeId: currentNode
    });
  }

  const nodeIsTerminal = currentNode
    ? input.definition.nodeMap.get(currentNode)?.isTerminal() ?? false
    : false;
  if (nodeIsTerminal !== input.projection.terminal) {
    throw new ProjectionCorruptedError({
      message: `Projection terminal flag does not match node ${currentNode ?? "null"}.`
    });
  }

  assertUniqueTextList(
    input.projection.recordedSignalIds,
    "recordedSignalIds"
  );
  assertUniqueTextList(
    input.projection.emittedCommandIds,
    "emittedCommandIds"
  );

  for (const pendingCommand of input.projection.pendingCommands) {
    if (!input.projection.emittedCommandIds.includes(pendingCommand.id)) {
      throw new ProjectionCorruptedError({
        message: `Pending command ${pendingCommand.id} is missing from emittedCommandIds.`
      });
    }
  }

  const lastSignalId = input.projection.lastSignal?.id ?? null;
  if (lastSignalId && !input.projection.recordedSignalIds.includes(lastSignalId)) {
    throw new ProjectionCorruptedError({
      message: `Last signal ${lastSignalId} is missing from recordedSignalIds.`
    });
  }
}

function buildPendingCommandMap(
  commands: WorkflowCommand[]
): Map<string, WorkflowCommand> {
  const pendingCommands = new Map<string, WorkflowCommand>();

  for (const command of commands) {
    if (pendingCommands.has(command.id)) {
      throw new ProjectionCorruptedError({
        message: `Projection checkpoint contains duplicate pending command id ${command.id}.`
      });
    }

    pendingCommands.set(command.id, command);
  }

  return pendingCommands;
}

function cloneProjection<
  Node extends WorkflowNodeId,
  Data,
>(projection: WorkflowProjection<Node, Data>): WorkflowProjection<Node, Data> {
  return {
    ...projection,
    pendingCommands: [...projection.pendingCommands],
    recordedSignalIds: [...projection.recordedSignalIds],
    emittedCommandIds: [...projection.emittedCommandIds]
  };
}

function assertUniqueTextList(values: string[], field: string) {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      throw new ProjectionCorruptedError({
        message: `Projection checkpoint contains duplicate ${field} value ${value}.`
      });
    }

    seen.add(value);
  }
}
