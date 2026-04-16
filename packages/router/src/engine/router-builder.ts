import type { WorkflowNodeId } from "../types/base.js";
import type { WorkflowRouterError } from "./router-errors.js";
import type { WorkflowRouterDefinition } from "./router-definition.js";
import {
  WorkflowRouter,
  type WorkflowRouterOptions
} from "./workflow-router.js";
import { Effect } from "effect";

export function createWorkflowRouter<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(
  definition: WorkflowRouterDefinition<Node, Data, Policy>,
  options: WorkflowRouterOptions = {}
): Effect.Effect<WorkflowRouter<Node, Data, Policy>, WorkflowRouterError, never> {
  return WorkflowRouter.make(definition, options);
}

export async function createWorkflowRouterAsync<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(
  definition: WorkflowRouterDefinition<Node, Data, Policy>,
  options: WorkflowRouterOptions = {}
): Promise<WorkflowRouter<Node, Data, Policy>> {
  return await Effect.runPromise(
    createWorkflowRouter(definition, options)
  );
}
