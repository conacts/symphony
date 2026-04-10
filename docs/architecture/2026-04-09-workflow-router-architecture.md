# Workflow Router Architecture

Date: 2026-04-09

## Purpose

Define the first isolated `packages/router` design for Symphony's future workflow routing layer.

This document captures the architectural direction discussed for:

- a durable workflow journal
- replayable routing decisions
- explicit `Node` and `Edge` building blocks
- a class-oriented router API
- future support for both deterministic and LLM-assisted routing strategies

The goal is not to replace Symphony's current runtime flow immediately. The goal is to build a
small, explicit, testable routing subsystem in isolation so we can evolve the product toward a
more modular and tunable workflow engine.

## Core Thesis

Symphony should stop encoding workflow decisions implicitly across tracker states, orchestrator
helpers, GitHub ingress handlers, and prompt selection code.

Instead, Symphony should introduce a workflow router with three explicit responsibilities:

1. Record workflow facts in a durable journal.
2. Derive the current workflow projection from that journal.
3. Route the next step by consuming a new signal against the current projection.

The router does not directly perform side effects. It emits commands. Other layers execute those
commands and feed the outcomes back into the journal.

That gives Symphony a platform we can:

- replay
- simulate
- A/B test
- compare across routing policies
- extend with stronger review and proof-oriented flows later

## Why This Exists

The current runtime flow is intentionally simple, but the control logic is still spread across
multiple layers:

- tracker state determines dispatchability
- run mode is derived from tracker state
- GitHub review signals mutate tracker state directly
- orchestrator state drives runtime execution details

That approach was useful to get the product working, but it now constrains the next step of the
platform.

The next step is not "add more special cases."

The next step is to build a general workflow engine that can support multiple development styles,
multiple review loops, and eventually multiple routing strategies.

## Product Direction

The router is the first major step toward a more general "build your own agent workflow" platform.

The platform should eventually support:

- deterministic state transitions
- configurable workflow graphs
- internal review gates
- richer sub-agent loops
- alternative development styles
- router-level experimentation across ticket populations
- future LLM-assisted routing policies

The router package should make those experiments possible without forcing the rest of the runtime to
be rewritten first.

## Design Goals

- Keep the first slice isolated to `packages/router`.
- Make history the source of truth.
- Derive current state from history instead of storing it as hidden mutable authority.
- Keep the router pure with respect to workflow decisions.
- Keep side effects outside the router.
- Use explicit, direct names.
- Make the API class-oriented without hiding control flow.
- Use `effect` only inside this package for typed errors and controlled evaluation.
- Make the router deterministic and replayable by default.
- Leave a clear seam for future non-deterministic route strategies.

## Non-Goals For V1

- no runtime integration yet
- no database integration yet
- no Linear integration yet
- no GitHub integration yet
- no CI integration yet
- no LLM routing implementation yet
- no attempt to solve every future workflow shape in the first version

V1 should only prove that the routing model itself is coherent and pleasant to work with.

## Mental Model

The closest practical analogy is:

### Event-Sourced Workflow Router

- workflow history is append-only
- current workflow location is derived from history
- new facts enter as signals
- the router interprets those facts
- the router emits decisions and commands
- command outcomes are recorded back into history

This is more precise than "just a state machine."

It behaves like a hybrid of:

### Temporal

- deterministic replay matters
- history matters more than mutable current state
- the workflow is a durable actor

### Statecharts / XState

- nodes are explicit
- edges are explicit
- transitions are explicit
- node entry and exit behavior is explicit

### Kubernetes Controllers

- observe facts
- reconcile toward the intended next step
- emit commands
- observe outcomes

### Git

- the journal is the commit history
- current node is just a projection like `HEAD`
- current state is not the authority; history is

## Authority Model

The workflow journal is the authority for router state.

Derived values like:

- current node
- last decision
- active pending commands
- terminal state

are projections.

That means we do not treat:

- `last route`
- `current route`
- `active run`

as the core source of truth.

Those remain useful fields in the projection, but they are derived from the journal.

## Key Domain Objects

### Workflow Journal

An append-only sequence of recorded workflow facts.

Examples:

- signal observed
- decision recorded
- command emitted
- command settled

The journal exists so we can replay, inspect, compare, and test workflows.

### Workflow Signal

A fact entering the router.

Examples:

- `tracker.state_changed`
- `implementation.completed`
- `review.changes_requested`
- `ci.status_observed`
- `operator.resume_requested`

Signals are inputs to the router. They are not routing decisions.

### Workflow Projection

The current derived state of the workflow, built from the journal.

Examples:

- current node
- pending commands
- terminal or non-terminal
- accumulated workflow data
- last observed signal
- last recorded decision

Projection checkpoints also need to carry the identity history required to resume safely, including
recorded signal ids and emitted command ids. Without that, a resumed session can no longer enforce
the same duplicate protections as a full-history replay.

### Workflow Decision

The router's interpretation of the latest signal against the current projection.

Examples:

- stay in place with no commands
- move from `queued` to `implementation`
- move from `review` to `rework`
- move from `review` to `approved_merge`

### Workflow Command

A requested side effect.

Examples:

- dispatch a run
- transition tracker state
- post a comment
- preserve or destroy workspace

The router does not execute commands. It emits them.

### Workflow Node

A named location in the workflow graph.

Nodes are explicit and may optionally provide entry and exit command factories.

### Workflow Edge

A declared transition between nodes.

An edge may be conditional and may contribute commands if selected.

### Router Strategy

The policy that selects an edge from the eligible set.

V1 ships with a deterministic strategy.

Future strategies may be:

- LLM-assisted
- heuristic
- randomized for experimentation
- cost-aware

## Tracker State Versus Router Node

These must remain distinct.

### Tracker State

External, coarse lifecycle state visible in Linear.

Examples:

- `Todo`
- `Bootstrapping`
- `In Progress`
- `In Review`
- `Approved`
- `Done`

### Router Node

Internal workflow location used by the routing graph.

Examples:

- `queued`
- `implementation`
- `rework`
- `review`
- `approved_merge`
- `done`

The router node should not be required to equal the tracker state.

That separation is important because:

- the router may have richer internal phases than Linear
- multiple internal nodes may map to one tracker state
- tracker states should remain coarse and usable for operators

## Why Nodes And Edges Should Be Classes

The router should remain data-first, but `Node` and `Edge` deserve first-class class wrappers for
three reasons:

1. They are core building blocks of the workflow graph.
2. They provide a clean and discoverable API surface.
3. They let us attach explicit behavior without hiding the graph structure.

The classes should stay small and obvious.

They should not become mini-frameworks.

## Proposed V1 Package Layout

`packages/router/`

- `package.json`
- `tsconfig.json`
- `eslint.config.ts`
- `vitest.config.ts`
- `src/index.ts`
- `src/router-errors.ts`
- `src/types/base.ts`
- `src/types/signal.ts`
- `src/types/command.ts`
- `src/types/decision.ts`
- `src/types/journal.ts`
- `src/types/projection.ts`
- `src/types/simulation.ts`
- `src/types/comparison.ts`
- `src/types/context.ts`
- `src/types/index.ts`
- `src/router-node.ts`
- `src/router-edge.ts`
- `src/router-strategy.ts`
- `src/router-deterministic-strategy.ts`
- `src/router-projection.ts`
- `src/router-definition.ts`
- `src/workflow-router.ts`
- `src/workflow-router-comparison.ts`
- `src/testing/workflow-router-test-kit.ts`
- `src/testing/symphony-current-flow-router.ts`
- `src/testing/symphony-current-flow-replay-fixtures.ts`
- `src/workflow-router.unit.test.ts`
- `src/workflow-router-comparison.unit.test.ts`
- `src/symphony-current-flow-router.unit.test.ts`

V1 stays intentionally small.

Unit tests should use the `.unit.test.ts` suffix.

If this package gains broader integration coverage later, follow the same pattern with:

- `.int.test.ts`
- `.e2e.test.ts`

The testing surface should be able to host progressively more realistic router definitions without
forcing runtime integration immediately.

The first example of that is a mocked "current Symphony flow" router definition plus replay
fixtures. That gives us a way to prove that today's lifecycle can be expressed through the router
package before the package is asked to own real control-plane work.

## Core Public API

The package should expose:

- `WorkflowNode`
- `WorkflowEdge`
- `WorkflowRouter`
- `WorkflowRouterComparison`
- `createWorkflowRouterComparison`
- `createDeterministicStrategy`
- a projection rehydration seam through `WorkflowRouter.rehydrate(...)`
- core router types
- typed router errors

## V1 API Shape

### `WorkflowNode`

Represents a graph node with optional terminal semantics and optional entry/exit command emission.

```ts
const review = new WorkflowNode("review");

const done = new WorkflowNode("done", {
  terminal: true
});
```

### `WorkflowEdge`

Represents a declared transition between nodes.

```ts
const reviewToRework = new WorkflowEdge({
  id: "review_to_rework",
  from: "review",
  to: "rework",
  reasonCode: "changes_requested",
  guard: ({ signal }) => signal.type === "review.changes_requested"
});
```

### `WorkflowRouter`

Owns:

- validation
- projection
- route evaluation
- simulation

```ts
const router = await Effect.runPromise(
  createWorkflowRouter({
    name: "symphony-default",
    version: "1",
    initialNode: "queued",
    nodes: [
      new WorkflowNode("queued"),
      new WorkflowNode("implementation"),
      new WorkflowNode("review"),
      new WorkflowNode("rework"),
      new WorkflowNode("approved_merge"),
      new WorkflowNode("done", { terminal: true })
    ],
    edges: [...],
    strategy: createDeterministicStrategy(),
    createInitialData: () => ({})
  })
);
```

### `WorkflowRouterComparison`

Represents a pure in-memory comparison harness for replaying the same signal stream against
multiple router candidates.

```ts
const comparison = await Effect.runPromise(
  createWorkflowRouterComparison({
    candidates: [
      {
        id: "auto-approve",
        router: defaultRouter,
        policy: autoApprovePolicy
      },
      {
        id: "manual-review",
        router: strictRouter,
        policy: strictPolicy
      }
    ]
  })
);
```

## Signals, Decisions, Commands, And Journal Events

The package should make these separate and explicit.

### Signals

Signals are facts entering the router.

### Decisions

Decisions are the router's chosen interpretation.

### Commands

Commands are requested side effects.

### Journal Events

Journal events are the durable record of:

- what was observed
- what was decided
- what was emitted
- what later succeeded or failed

## Why The Router Should Choose Transitions

Nodes should not directly choose the next node.

Nodes may contribute behavior:

- entry commands
- exit commands
- metadata

Edges may contribute behavior:

- guards
- commands

But the router should remain the central authority that decides:

- which edge is eligible
- which edge is selected
- what transition happens next

That keeps control flow centralized and traceable.

## Routing Strategy

V1 includes one strategy:

### Deterministic Strategy

- examine eligible edges
- sort by priority
- choose the highest-priority match
- fail if multiple edges tie for highest priority

That keeps routing explicit and forces clarity in the graph.

Later, we can add:

### LLM Strategy

- deterministic guards still narrow the candidate set
- the LLM chooses among eligible edges
- the strategy result is recorded as metadata in the decision

This design is intentional.

We do not want arbitrary nodes to jump anywhere with hidden logic.

We do want users to be able to choose different routing strategies over a declared graph.

## Journal-First Architecture

This is the most important design constraint:

The workflow should be reconstructable from journal events alone.

If a routing decision depends on some external fact, that fact should arrive as a signal and be
journaled.

That means we do not want hidden routing decisions based on ad hoc reads from:

- Linear
- GitHub
- CI
- the runtime

Instead, those systems should feed the router observed signals.

Examples:

- `tracker.state_observed`
- `github.review_status_observed`
- `ci.status_observed`
- `runtime.run_status_observed`

This is what makes replay and experimentation possible.

## Projection

The projection should derive:

- `currentNode`
- `pendingCommands`
- `terminal`
- `sequence`
- `data`
- `lastSignal`
- `lastDecision`

The projection is rebuilt from the journal whenever needed.

This keeps the authority model clean and makes replay deterministic.

## Suggested V1 Data Shapes

### Signal

```ts
type WorkflowSignal = {
  id?: string;
  type: string;
  source: "tracker" | "runtime" | "review" | "ci" | "operator" | "router";
  occurredAt?: string;
  causationId?: string | null;
  correlationId?: string | null;
  payload: Record<string, unknown> | null;
};
```

### Command

```ts
type WorkflowCommand = {
  id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  dedupeKey?: string | null;
};
```

### Decision

```ts
type WorkflowDecision<Node extends string = string> = {
  id: string;
  fromNode: Node | null;
  toNode: Node | null;
  edgeId: string | null;
  reasonCode: string;
  commands: WorkflowCommand[];
  trace: WorkflowTraceEntry[];
  selectionMetadata?: Record<string, unknown> | null;
};
```

### Journal Event

```ts
type WorkflowJournalEvent<Node extends string = string> =
  | { kind: "signal_recorded"; signal: WorkflowSignal; recordedAt: string }
  | { kind: "decision_recorded"; decision: WorkflowDecision<Node>; recordedAt: string }
  | { kind: "command_emitted"; decisionId: string; command: WorkflowCommand; recordedAt: string }
  | {
      kind: "command_settled";
      commandId: string;
      status: "succeeded" | "failed";
      payload: Record<string, unknown> | null;
      recordedAt: string;
    };
```

### Simulation Result

```ts
type WorkflowSimulationResult<Node extends string, Data> = {
  history: WorkflowHistory<Node>;
  projection: WorkflowProjection<Node, Data>;
  steps: ReadonlyArray<{
    signal: WorkflowSignal;
    result: WorkflowRouteResult<Node, Data>;
  }>;
};
```

### Comparison Result

```ts
type WorkflowRouterComparisonResult<Node extends string, Data> = {
  workflowId: string;
  signals: ReadonlyArray<WorkflowSignal>;
  entries: ReadonlyArray<{
    candidateId: string;
    simulation: WorkflowSimulationResult<Node, Data>;
  }>;
  summary: {
    diverged: boolean;
    finalNodeByCandidate: Record<string, Node | null>;
    reasonCodesByCandidate: Record<string, string[]>;
    pendingCommandCountsByCandidate: Record<string, number>;
  };
};
```

## `WorkflowNode` Class Design

The `WorkflowNode` class should stay intentionally small.

It should represent:

- node identity
- terminal status
- optional enter command factory
- optional exit command factory

It should not own transition logic.

Suggested shape:

```ts
class WorkflowNode<Node extends string, Data, Policy> {
  readonly id: Node;
  readonly terminal: boolean;

  constructor(
    id: Node,
    options?: WorkflowNodeOptions<Data, Policy>
  );

  isTerminal(): boolean;
  emitEnterCommands(input: WorkflowTransitionContext<Node, Data, Policy>): WorkflowCommand[];
  emitExitCommands(input: WorkflowTransitionContext<Node, Data, Policy>): WorkflowCommand[];
}
```

### Why This Is Enough

This gives the node exactly the right amount of power:

- contribute commands on entry
- contribute commands on exit
- expose whether the workflow should be treated as terminal

It does not let the node secretly own the graph.

## `WorkflowEdge` Class Design

The `WorkflowEdge` class should represent:

- identity
- from-node
- to-node
- reason code
- priority
- optional guard
- optional command factory

Suggested shape:

```ts
class WorkflowEdge<Node extends string, Data, Policy> {
  readonly id: string;
  readonly from: Node | "*";
  readonly to: Node;
  readonly reasonCode: string;
  readonly priority: number;

  constructor(input: WorkflowEdgeOptions<Node, Data, Policy>);

  matchesCurrentNode(currentNode: Node | null): boolean;
  accepts(input: WorkflowEvaluationContext<Node, Data, Policy>): boolean;
  emitCommands(input: WorkflowTransitionContext<Node, Data, Policy>): WorkflowCommand[];
}
```

### Why This Is Enough

This makes the edge the natural place for:

- transition conditions
- edge-level command emission
- transition rationale

It still leaves final transition selection to the router.

## `WorkflowRouter` Class Design

The `WorkflowRouter` class should:

- validate the graph
- project current state from the journal
- evaluate a new signal
- emit the next decision and its journal events
- simulate whole signal sequences

Suggested shape:

```ts
class WorkflowRouter<Node extends string, Data, Policy> {
  static make(input: WorkflowRouterDefinition<Node, Data, Policy>): Effect<WorkflowRouter<...>, WorkflowRouterError>;

  definition(): WorkflowRouterDefinition<Node, Data, Policy>;

  project(input: {
    workflowId: string;
    history: WorkflowHistory<Node>;
    policy: Policy;
  }): Effect<WorkflowProjection<Node, Data>, WorkflowRouterError>;

  receive(input: {
    workflowId: string;
    history: WorkflowHistory<Node>;
    signal: WorkflowSignal;
    policy: Policy;
  }): Effect<WorkflowRouteResult<Node, Data>, WorkflowRouterError>;

  simulate(input: {
    workflowId: string;
    history?: WorkflowHistory<Node>;
    signals: WorkflowSignal[];
    policy: Policy;
  }): Effect<WorkflowSimulationResult<Node, Data>, WorkflowRouterError>;
}
```

## `WorkflowRouterComparison` Class Design

The `WorkflowRouterComparison` class should:

- validate that comparison candidate ids are explicit and unique
- replay one signal stream against multiple candidate routers
- preserve each candidate's base history and policy
- summarize divergence without mutating any external system

Suggested shape:

```ts
class WorkflowRouterComparison<Node extends string, Data, Policy> {
  static make(input: {
    candidates: ReadonlyArray<WorkflowRouterCandidate<Node, Data, Policy>>;
  }): Effect<WorkflowRouterComparison<Node, Data, Policy>, InvalidRouterComparisonError>;

  candidates(): ReadonlyArray<WorkflowRouterCandidate<Node, Data, Policy>>;

  compare(input: {
    workflowId: string;
    signals: ReadonlyArray<WorkflowSignal>;
  }): Effect<WorkflowRouterComparisonResult<Node, Data>, WorkflowRouterError>;
}
```

### Why This Belongs In The Package

This is not test sugar.

This is the seam that lets us:

- compare router policies before runtime integration
- A/B test multiple router definitions against the same workflow facts
- reason about divergence deterministically
- keep optimization work inside the package instead of inventing ad hoc scripts later

## `WorkflowRouterDefinition`

The router definition should declare:

- name
- version
- initial node
- node set
- edge set
- strategy
- initial data builder
- optional data reducer

Suggested shape:

```ts
type WorkflowRouterDefinition<Node extends string, Data, Policy> = {
  name: string;
  version: string;
  initialNode: Node;
  nodes: ReadonlyArray<WorkflowNode<Node, Data, Policy>>;
  edges: ReadonlyArray<WorkflowEdge<Node, Data, Policy>>;
  strategy: RouterStrategy<Node, Data, Policy>;
  createInitialData(): Data;
  reduceData?: (input: {
    data: Data;
    event: WorkflowJournalEvent<Node>;
    policy: Policy;
  }) => Data;
};
```

## `WorkflowProjection`

Projection should be intentionally boring.

Suggested shape:

```ts
type WorkflowProjection<Node extends string, Data> = {
  workflowId: string;
  currentNode: Node | null;
  pendingCommands: WorkflowCommand[];
  terminal: boolean;
  sequence: number;
  data: Data;
  lastSignal: WorkflowSignal | null;
  lastDecision: WorkflowDecision<Node> | null;
};
```

This is the right place for:

- current node
- pending work
- accumulated router-owned data

It is not the place for hidden side-effect authority.

## Traceability

Every decision should include a trace so we can explain how the router behaved.

Examples:

- signal received
- candidate edge considered
- guard passed
- guard failed
- strategy selected edge
- no match

This trace is essential for:

- debugging
- comparing routers
- explaining unexpected behavior
- tuning strategies

## Why Effect Belongs Only In This Package

`effect` is a good fit here because:

- router evaluation is a contained domain
- validation errors should be explicit
- strategy evaluation is a natural effect boundary
- simulation and receive flows benefit from typed failures

The rest of the runtime does not need to adopt Effect yet.

That keeps the blast radius small and the package experimental in a healthy way.

## Proposed V1 Error Types

- `InvalidRouterDefinitionError`
- `UnknownNodeError`
- `UnknownEdgeSelectionError`
- `ProjectionCorruptedError`
- `AmbiguousTransitionError`
- `DuplicateSignalIdError`
- `DuplicateCommandIdError`

These are enough for the first slice.

## V1 Behavior Rules

- Empty journal projects to the initial node.
- A signal is always journaled before its decision.
- A selected edge produces a decision and zero or more emitted commands.
- A no-match result still produces a decision.
- Current node is derived from the most recent decision.
- Pending commands are emitted commands minus settled commands.
- Terminal status is derived from the current node definition.
- Duplicate signal ids are rejected.
- Duplicate command ids are rejected.

## V1 Testing Strategy

The router package should be heavily tested in isolation.

Minimum tests:

- projects the initial node from an empty journal
- routes a matching signal to the expected next node
- records no-match decisions cleanly
- emits edge and node commands in explicit order
- projects pending commands and removes them when settled
- rejects invalid router definitions
- rejects duplicate signal ids
- rejects duplicate command ids
- fails on ambiguous deterministic routing
- simulates a sequence of signals deterministically

## How This Evolves Later

Once the isolated router package is solid:

1. add a `route_decisions` store in the database
2. mirror route decisions into issue timeline/log views if useful
3. route current Symphony behavior through one router definition
4. add review verdict signals
5. add approval gate nodes
6. add alternate strategies
7. compare multiple routers over real ticket populations

## Final Design Summary

The router package should be built around this formula:

**journal + projection + graph + strategy + commands**

Where:

- the journal is the durable authority
- the projection is derived state
- nodes and edges define the graph
- strategy chooses among eligible edges
- commands carry side effects out of the router

That is the smallest design that gives Symphony a future-proof, modular, replayable workflow core
without forcing the entire runtime to change all at once.
