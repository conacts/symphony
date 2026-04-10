import { Effect } from "effect";
import type { WorkflowRouterError } from "./router-errors.js";
import type { WorkflowRouter } from "./workflow-router.js";
import type {
  WorkflowHistory,
  WorkflowJournalEvent,
  WorkflowPayload,
  WorkflowProjection,
  WorkflowRouteResult,
  WorkflowSignal
} from "./types/index.js";
import type { WorkflowNodeId } from "./types/base.js";

export class WorkflowSession<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> {
  static make<Node extends WorkflowNodeId, Data, Policy>(input: {
    router: WorkflowRouter<Node, Data, Policy>;
    workflowId: string;
    policy: Policy;
    history?: WorkflowHistory<Node>;
  }): Effect.Effect<WorkflowSession<Node, Data, Policy>, WorkflowRouterError, never> {
    return Effect.gen(function* () {
      const history = [...(input.history ?? [])];
      const projection = yield* input.router.project({
        workflowId: input.workflowId,
        history,
        policy: input.policy
      });

      return new WorkflowSession({
        router: input.router,
        workflowId: input.workflowId,
        policy: input.policy,
        history,
        projection
      });
    });
  }

  static resume<Node extends WorkflowNodeId, Data, Policy>(input: {
    router: WorkflowRouter<Node, Data, Policy>;
    projection: WorkflowProjection<Node, Data>;
    policy: Policy;
    history?: WorkflowHistory<Node>;
  }): Effect.Effect<WorkflowSession<Node, Data, Policy>, WorkflowRouterError, never> {
    return Effect.gen(function* () {
      const history = [...(input.history ?? [])];
      const projection = yield* input.router.rehydrate({
        projection: input.projection,
        tailHistory: [],
        policy: input.policy
      });

      return new WorkflowSession({
        router: input.router,
        workflowId: projection.workflowId,
        policy: input.policy,
        history,
        projection
      });
    });
  }

  readonly #router: WorkflowRouter<Node, Data, Policy>;
  readonly #workflowId: string;
  readonly #policy: Policy;
  #history: WorkflowJournalEvent<Node>[];
  #projection: WorkflowProjection<Node, Data>;

  private constructor(input: {
    router: WorkflowRouter<Node, Data, Policy>;
    workflowId: string;
    policy: Policy;
    history: WorkflowJournalEvent<Node>[];
    projection: WorkflowProjection<Node, Data>;
  }) {
    this.#router = input.router;
    this.#workflowId = input.workflowId;
    this.#policy = input.policy;
    this.#history = input.history;
    this.#projection = input.projection;
  }

  workflowId(): string {
    return this.#workflowId;
  }

  policy(): Policy {
    return this.#policy;
  }

  history(): WorkflowHistory<Node> {
    return this.#history;
  }

  projection(): WorkflowProjection<Node, Data> {
    return this.#projection;
  }

  receive(
    signal: WorkflowSignal
  ): Effect.Effect<WorkflowRouteResult<Node, Data>, WorkflowRouterError, never> {
    return Effect.gen(this, function* () {
      const result = yield* this.#router.receiveFromProjection({
        projection: this.#projection,
        signal,
        policy: this.#policy
      });

      this.#history = [...this.#history, ...result.events];
      this.#projection = result.projectionAfter;

      return result;
    });
  }

  async receiveAsync(
    signal: WorkflowSignal
  ): Promise<WorkflowRouteResult<Node, Data>> {
    return await Effect.runPromise(this.receive(signal));
  }

  settleCommand(input: {
    commandId: string;
    status: "succeeded" | "failed";
    payload?: WorkflowPayload;
    recordedAt?: string;
  }): Effect.Effect<WorkflowProjection<Node, Data>, WorkflowRouterError, never> {
    return Effect.gen(this, function* () {
      const event: WorkflowJournalEvent<Node> = {
        kind: "command_settled",
        commandId: input.commandId,
        status: input.status,
        payload: input.payload ?? null,
        recordedAt: input.recordedAt ?? new Date().toISOString()
      };

      const nextProjection = yield* this.#router.rehydrate({
        projection: this.#projection,
        tailHistory: [event],
        policy: this.#policy
      });

      this.#history = [...this.#history, event];
      this.#projection = nextProjection;

      return nextProjection;
    });
  }

  async settleCommandAsync(input: {
    commandId: string;
    status: "succeeded" | "failed";
    payload?: WorkflowPayload;
    recordedAt?: string;
  }): Promise<WorkflowProjection<Node, Data>> {
    return await Effect.runPromise(this.settleCommand(input));
  }
}
