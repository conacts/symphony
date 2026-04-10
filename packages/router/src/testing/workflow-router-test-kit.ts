import { Effect } from "effect";
import {
  InvalidRouterDefinitionError,
  type WorkflowRouterError
} from "../router-errors.js";
import type {
  WorkflowDataReducer,
  WorkflowRouterDefinition
} from "../router-definition.js";
import {
  WorkflowEdge,
  type WorkflowEdgeOptions
} from "../router-edge.js";
import {
  WorkflowNode,
  type WorkflowNodeOptions
} from "../router-node.js";
import {
  createDeterministicStrategy
} from "../router-deterministic-strategy.js";
import type { RouterStrategy } from "../router-strategy.js";
import {
  WorkflowRouter,
  type WorkflowRouterOptions
} from "../workflow-router.js";
import type {
  WorkflowDecision,
  WorkflowJournalEvent,
  WorkflowPayload,
  WorkflowSignal
} from "../types/index.js";
import type { WorkflowNodeId } from "../types/base.js";

export function createWorkflowRouterTestBuilder<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(): WorkflowRouterTestBuilder<Node, Data, Policy> {
  return new WorkflowRouterTestBuilder<Node, Data, Policy>();
}

export class WorkflowRouterTestBuilder<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> {
  #name = "test-router";
  #version = "1";
  #initialNode: Node | null = null;
  #nodes: WorkflowNode<Node, Data, Policy>[] = [];
  #edges: WorkflowEdge<Node, Data, Policy>[] = [];
  #strategy: RouterStrategy<Node, Data, Policy> =
    createDeterministicStrategy<Node, Data, Policy>();
  #createInitialData: (() => Data) | null = null;
  #reduceData: WorkflowDataReducer<Node, Data, Policy> | undefined;
  #routerOptions: WorkflowRouterOptions = {};

  named(name: string): this {
    this.#name = name;
    return this;
  }

  version(version: string): this {
    this.#version = version;
    return this;
  }

  startingAt(node: Node): this {
    this.#initialNode = node;
    return this;
  }

  withNode(
    node: Node | WorkflowNode<Node, Data, Policy>,
    options?: WorkflowNodeOptions<Data, Policy>
  ): this {
    this.#nodes.push(
      node instanceof WorkflowNode ? node : new WorkflowNode(node, options)
    );
    return this;
  }

  withEdge(
    edge: WorkflowEdge<Node, Data, Policy> | WorkflowEdgeOptions<Node, Data, Policy>
  ): this {
    this.#edges.push(edge instanceof WorkflowEdge ? edge : new WorkflowEdge(edge));
    return this;
  }

  withStrategy(strategy: RouterStrategy<Node, Data, Policy>): this {
    this.#strategy = strategy;
    return this;
  }

  withInitialData(data: Data | (() => Data)): this {
    this.#createInitialData =
      typeof data === "function" ? (data as () => Data) : () => data;
    return this;
  }

  withReducer(reduceData: WorkflowDataReducer<Node, Data, Policy>): this {
    this.#reduceData = reduceData;
    return this;
  }

  withRouterOptions(options: WorkflowRouterOptions): this {
    this.#routerOptions = {
      ...this.#routerOptions,
      ...options
    };
    return this;
  }

  buildDefinition(): WorkflowRouterDefinition<Node, Data, Policy> {
    if (this.#initialNode === null) {
      throw new InvalidRouterDefinitionError({
        message: "Workflow router test builder requires an initial node."
      });
    }

    if (this.#createInitialData === null) {
      throw new InvalidRouterDefinitionError({
        message: "Workflow router test builder requires initial data."
      });
    }

    return {
      name: this.#name,
      version: this.#version,
      initialNode: this.#initialNode,
      nodes: this.#nodes,
      edges: this.#edges,
      strategy: this.#strategy,
      createInitialData: this.#createInitialData,
      reduceData: this.#reduceData
    };
  }

  build(): Effect.Effect<WorkflowRouter<Node, Data, Policy>, WorkflowRouterError, never> {
    return Effect.flatMap(
      Effect.try({
        try: () => this.buildDefinition(),
        catch: (error) =>
          error instanceof InvalidRouterDefinitionError
            ? error
            : new InvalidRouterDefinitionError({
                message:
                  error instanceof Error
                    ? error.message
                    : "Workflow router test builder failed."
              })
      }),
      (definition) => WorkflowRouter.make(definition, this.#routerOptions)
    );
  }
}

export function recordSignalEvent<Node extends WorkflowNodeId>(
  signal: WorkflowSignal,
  recordedAt: string
): Extract<WorkflowJournalEvent<Node>, { kind: "signal_recorded" }> {
  return {
    kind: "signal_recorded",
    signal,
    recordedAt
  };
}

export function recordDecisionEvent<Node extends WorkflowNodeId>(
  decision: WorkflowDecision<Node>,
  recordedAt: string
): Extract<WorkflowJournalEvent<Node>, { kind: "decision_recorded" }> {
  return {
    kind: "decision_recorded",
    decision,
    recordedAt
  };
}

export function settleCommandEvent<Node extends WorkflowNodeId>(input: {
  commandId: string;
  status: "succeeded" | "failed";
  recordedAt: string;
  payload?: WorkflowPayload;
}): Extract<WorkflowJournalEvent<Node>, { kind: "command_settled" }> {
  return {
    kind: "command_settled",
    commandId: input.commandId,
    status: input.status,
    payload: input.payload ?? null,
    recordedAt: input.recordedAt
  };
}
