import { randomUUID } from "node:crypto";
import { Effect } from "effect";
import {
  DuplicateCommandIdError,
  DuplicateSignalIdError,
  UnknownEdgeSelectionError,
  toWorkflowRouterError,
  type WorkflowRouterError
} from "./router-errors.js";
import {
  type NormalizedWorkflowRouterDefinition,
  type WorkflowRouterDefinition,
  validateWorkflowRouterDefinition
} from "./router-definition.js";
import {
  projectWorkflow,
  rehydrateWorkflowProjection
} from "./router-projection.js";
import type { WorkflowEdge } from "./router-edge.js";
import { WorkflowSession } from "./workflow-session.js";
import type {
  WorkflowHistory,
  WorkflowJournalEvent,
  WorkflowProjection,
  WorkflowRouteResult,
  WorkflowSignal,
  WorkflowSimulationResult,
  WorkflowSimulationStep,
  WorkflowTraceEntry,
  WorkflowTransitionContext
} from "./types/index.js";
import type { WorkflowNodeId } from "./types/base.js";

export type WorkflowRouterOptions = {
  now?: () => Date;
  createId?: (prefix: string) => string;
};

export class WorkflowRouter<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> {
  static make<Node extends WorkflowNodeId, Data, Policy>(
    definition: WorkflowRouterDefinition<Node, Data, Policy>,
    options: WorkflowRouterOptions = {}
  ): Effect.Effect<WorkflowRouter<Node, Data, Policy>, WorkflowRouterError, never> {
    return Effect.map(
      validateWorkflowRouterDefinition(definition),
      (normalized) => new WorkflowRouter(normalized, options)
    );
  }

  readonly #definition: NormalizedWorkflowRouterDefinition<Node, Data, Policy>;
  readonly #now: () => Date;
  readonly #createId: (prefix: string) => string;

  private constructor(
    definition: NormalizedWorkflowRouterDefinition<Node, Data, Policy>,
    options: WorkflowRouterOptions
  ) {
    this.#definition = definition;
    this.#now = options.now ?? (() => new Date());
    this.#createId =
      options.createId ??
      ((prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`);
  }

  definition(): WorkflowRouterDefinition<Node, Data, Policy> {
    return this.#definition;
  }

  startSession(input: {
    workflowId: string;
    policy: Policy;
    history?: WorkflowHistory<Node>;
  }): Effect.Effect<WorkflowSession<Node, Data, Policy>, WorkflowRouterError, never> {
    return WorkflowSession.make({
      router: this,
      workflowId: input.workflowId,
      policy: input.policy,
      history: input.history
    });
  }

  async startSessionAsync(input: {
    workflowId: string;
    policy: Policy;
    history?: WorkflowHistory<Node>;
  }): Promise<WorkflowSession<Node, Data, Policy>> {
    return await Effect.runPromise(this.startSession(input));
  }

  resumeSession(input: {
    projection: WorkflowProjection<Node, Data>;
    policy: Policy;
    history?: WorkflowHistory<Node>;
  }): Effect.Effect<WorkflowSession<Node, Data, Policy>, WorkflowRouterError, never> {
    return WorkflowSession.resume({
      router: this,
      projection: input.projection,
      policy: input.policy,
      history: input.history
    });
  }

  async resumeSessionAsync(input: {
    projection: WorkflowProjection<Node, Data>;
    policy: Policy;
    history?: WorkflowHistory<Node>;
  }): Promise<WorkflowSession<Node, Data, Policy>> {
    return await Effect.runPromise(this.resumeSession(input));
  }

  project(input: {
    workflowId: string;
    history: WorkflowHistory<Node>;
    policy: Policy;
  }): Effect.Effect<WorkflowProjection<Node, Data>, WorkflowRouterError, never> {
    return projectWorkflow({
      definition: this.#definition,
      workflowId: input.workflowId,
      history: input.history,
      policy: input.policy
    });
  }

  async projectAsync(input: {
    workflowId: string;
    history: WorkflowHistory<Node>;
    policy: Policy;
  }): Promise<WorkflowProjection<Node, Data>> {
    return await Effect.runPromise(this.project(input));
  }

  rehydrate(input: {
    projection: WorkflowProjection<Node, Data>;
    tailHistory: WorkflowHistory<Node>;
    policy: Policy;
  }): Effect.Effect<WorkflowProjection<Node, Data>, WorkflowRouterError, never> {
    return rehydrateWorkflowProjection({
      definition: this.#definition,
      projection: input.projection,
      tailHistory: input.tailHistory,
      policy: input.policy
    });
  }

  async rehydrateAsync(input: {
    projection: WorkflowProjection<Node, Data>;
    tailHistory: WorkflowHistory<Node>;
    policy: Policy;
  }): Promise<WorkflowProjection<Node, Data>> {
    return await Effect.runPromise(this.rehydrate(input));
  }

  receive(input: {
    workflowId: string;
    history: WorkflowHistory<Node>;
    signal: WorkflowSignal;
    policy: Policy;
  }): Effect.Effect<WorkflowRouteResult<Node, Data>, WorkflowRouterError, never> {
    return Effect.gen(this, function* () {
      const projectionBefore = yield* this.project({
        workflowId: input.workflowId,
        history: input.history,
        policy: input.policy
      });

      return yield* this.receiveFromProjection({
        projection: projectionBefore,
        signal: input.signal,
        policy: input.policy
      });
    });
  }

  async receiveAsync(input: {
    workflowId: string;
    history: WorkflowHistory<Node>;
    signal: WorkflowSignal;
    policy: Policy;
  }): Promise<WorkflowRouteResult<Node, Data>> {
    return await Effect.runPromise(this.receive(input));
  }

  receiveFromProjection(input: {
    projection: WorkflowProjection<Node, Data>;
    signal: WorkflowSignal;
    policy: Policy;
  }): Effect.Effect<WorkflowRouteResult<Node, Data>, WorkflowRouterError, never> {
    return Effect.gen(this, function* () {
      const projectionBefore = yield* this.rehydrate({
        projection: input.projection,
        tailHistory: [],
        policy: input.policy
      });
      const normalizedSignal = this.#normalizeSignal(input.signal);
      yield* this.#ensureSignalIdIsUniqueInProjection(
        projectionBefore,
        normalizedSignal.id
      );
      const signalEvent: Extract<WorkflowJournalEvent<Node>, { kind: "signal_recorded" }> = {
        kind: "signal_recorded",
        signal: normalizedSignal,
        recordedAt: normalizedSignal.occurredAt!
      };

      const { candidates, trace } = this.#collectCandidates({
        projection: projectionBefore,
        signal: normalizedSignal,
        policy: input.policy
      });

      const selection = yield* this.#definition.strategy.select({
        candidates,
        projection: projectionBefore,
        signal: normalizedSignal,
        policy: input.policy
      });

      const selectedEdge = selection.edgeId
        ? this.#definition.edgeMap.get(selection.edgeId) ?? null
        : null;
      if (selection.edgeId && !selectedEdge) {
        return yield* Effect.fail(
          new UnknownEdgeSelectionError({
            edgeId: selection.edgeId
          })
        );
      }

      const fromNode = projectionBefore.currentNode;
      const toNode =
        selectedEdge?.to ?? projectionBefore.currentNode ?? this.#definition.initialNode;

      if (selectedEdge) {
        trace.push({
          kind: "strategy_selected",
          ref: selectedEdge.id,
          detail: selection.metadata ?? null
        });
      } else {
        trace.push({
          kind: "no_match",
          ref: fromNode ?? "initial",
          detail: {
            signalType: normalizedSignal.type
          }
        });
      }

      const transitionContext: WorkflowTransitionContext<Node, Data, Policy> = {
        projection: projectionBefore,
        signal: normalizedSignal,
        policy: input.policy,
        fromNode,
        toNode,
        edgeId: selectedEdge?.id ?? null
      };

      const commands = selectedEdge
        ? this.#buildTransitionCommands(selectedEdge, transitionContext)
        : [];
      yield* this.#ensureCommandIdsAreUniqueInProjection(projectionBefore, commands);

      const decision = {
        id: this.#createId("decision"),
        fromNode,
        toNode,
        edgeId: selectedEdge?.id ?? null,
        reasonCode: selection.reasonCode ?? selectedEdge?.reasonCode ?? "no_matching_edge",
        commands,
        trace,
        selectionMetadata: selection.metadata ?? null
      };

      const decisionEvent: Extract<WorkflowJournalEvent<Node>, { kind: "decision_recorded" }> = {
        kind: "decision_recorded",
        decision,
        recordedAt: this.#isoNow()
      };

      const commandEvents: Array<Extract<WorkflowJournalEvent<Node>, { kind: "command_emitted" }>> =
        commands.map((command) => ({
          kind: "command_emitted",
          decisionId: decision.id,
          command,
          recordedAt: this.#isoNow()
        }));

      const events: WorkflowJournalEvent<Node>[] = [
        signalEvent,
        decisionEvent,
        ...commandEvents
      ];

      return {
        projectionBefore,
        signalEvent,
        decision,
        events,
        projectionAfter: yield* this.rehydrate({
          projection: projectionBefore,
          tailHistory: events,
          policy: input.policy
        })
      };
    });
  }

  async receiveFromProjectionAsync(input: {
    projection: WorkflowProjection<Node, Data>;
    signal: WorkflowSignal;
    policy: Policy;
  }): Promise<WorkflowRouteResult<Node, Data>> {
    return await Effect.runPromise(this.receiveFromProjection(input));
  }

  simulate(input: {
    workflowId: string;
    history?: WorkflowHistory<Node>;
    signals: ReadonlyArray<WorkflowSignal>;
    policy: Policy;
  }): Effect.Effect<
    WorkflowSimulationResult<Node, Data>,
    WorkflowRouterError,
    never
  > {
    return Effect.gen(this, function* () {
      let history = [...(input.history ?? [])];
      const steps: WorkflowSimulationStep<Node, Data>[] = [];

      for (const signal of input.signals) {
        const result = yield* this.receive({
          workflowId: input.workflowId,
          history,
          signal,
          policy: input.policy
        });
        history = [...history, ...result.events];
        steps.push({
          signal,
          result
        });
      }

      const projection = yield* this.project({
        workflowId: input.workflowId,
        history,
        policy: input.policy
      });

      return {
        history,
        projection,
        steps
      };
    });
  }

  async simulateAsync(input: {
    workflowId: string;
    history?: WorkflowHistory<Node>;
    signals: ReadonlyArray<WorkflowSignal>;
    policy: Policy;
  }): Promise<WorkflowSimulationResult<Node, Data>> {
    return await Effect.runPromise(this.simulate(input));
  }

  #collectCandidates(input: {
    projection: WorkflowProjection<Node, Data>;
    signal: WorkflowSignal;
    policy: Policy;
  }): {
    candidates: Array<{
      edge: WorkflowEdge<Node, Data, Policy>;
      projection: WorkflowProjection<Node, Data>;
      signal: WorkflowSignal;
      policy: Policy;
    }>;
    trace: WorkflowTraceEntry[];
  } {
    const trace: WorkflowTraceEntry[] = [
      {
        kind: "signal_received",
        ref: input.signal.type,
        detail: {
          source: input.signal.source
        }
      }
    ];
    const candidates: Array<{
      edge: WorkflowEdge<Node, Data, Policy>;
      projection: WorkflowProjection<Node, Data>;
      signal: WorkflowSignal;
      policy: Policy;
    }> = [];

    for (const edge of this.#definition.edges) {
      if (!edge.matchesCurrentNode(input.projection.currentNode)) {
        continue;
      }

      trace.push({
        kind: "candidate_edge",
        ref: edge.id,
        detail: {
          from: edge.from,
          to: edge.to
        }
      });

      const accepted = edge.accepts({
        projection: input.projection,
        signal: input.signal,
        policy: input.policy
      });

      if (accepted) {
        trace.push({
          kind: "guard_passed",
          ref: edge.id
        });
        candidates.push({
          edge,
          projection: input.projection,
          signal: input.signal,
          policy: input.policy
        });
      } else {
        trace.push({
          kind: "guard_failed",
          ref: edge.id
        });
      }
    }

    return {
      candidates,
      trace
    };
  }

  #buildTransitionCommands(
    edge: WorkflowEdge<Node, Data, Policy>,
    context: WorkflowTransitionContext<Node, Data, Policy>
  ) {
    const fromNode = context.fromNode
      ? this.#definition.nodeMap.get(context.fromNode) ?? null
      : null;
    const toNode = context.toNode
      ? this.#definition.nodeMap.get(context.toNode) ?? null
      : null;

    const exitCommands =
      fromNode && context.fromNode !== context.toNode
        ? fromNode.emitExitCommands(context)
        : [];
    const edgeCommands = edge.emitCommands(context);
    const enterCommands =
      toNode && context.fromNode !== context.toNode
        ? toNode.emitEnterCommands(context)
        : [];

    return [
      ...exitCommands,
      ...edgeCommands,
      ...enterCommands
    ];
  }

  #normalizeSignal(signal: WorkflowSignal): Required<WorkflowSignal> {
    return {
      ...signal,
      id: signal.id?.trim() || this.#createId("signal"),
      occurredAt: signal.occurredAt?.trim() || this.#isoNow(),
      causationId: signal.causationId ?? null,
      correlationId: signal.correlationId ?? null
    };
  }

  #isoNow(): string {
    return this.#now().toISOString();
  }

  #ensureSignalIdIsUniqueInProjection(
    projection: WorkflowProjection<Node, Data>,
    signalId: string | undefined
  ): Effect.Effect<void, WorkflowRouterError, never> {
    return Effect.try({
      try: () => {
        if (!signalId) {
          return;
        }

        if (projection.recordedSignalIds.includes(signalId)) {
          throw new DuplicateSignalIdError({
            signalId
          });
        }
      },
      catch: (error) =>
        toWorkflowRouterError(error, "Signal uniqueness validation failed.")
    });
  }

  #ensureCommandIdsAreUniqueInProjection(
    projection: WorkflowProjection<Node, Data>,
    commands: ReadonlyArray<{ id: string }>
  ): Effect.Effect<void, WorkflowRouterError, never> {
    return Effect.try({
      try: () => {
        const existingCommandIds = new Set<string>(projection.emittedCommandIds);

        const nextCommandIds = new Set<string>();
        for (const command of commands) {
          if (existingCommandIds.has(command.id) || nextCommandIds.has(command.id)) {
            throw new DuplicateCommandIdError({
              commandId: command.id
            });
          }
          nextCommandIds.add(command.id);
        }
      },
      catch: (error) =>
        toWorkflowRouterError(error, "Command id uniqueness validation failed.")
    });
  }
}
