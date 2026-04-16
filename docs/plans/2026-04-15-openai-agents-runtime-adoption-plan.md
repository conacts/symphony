# OpenAI Agents-Style Runtime Adoption Plan

Date: 2026-04-15

Status: Draft

Audience:

- Symphony maintainers
- Runtime implementers
- Future contributors evaluating why Symphony adopted OpenAI Agents-style runtime structure without adopting the hosted OpenAI runtime itself

Related documents:

- [`docs/plans/2026-04-15-package-boundary-division-plan.md`](./2026-04-15-package-boundary-division-plan.md)
- [`docs/plans/2026-04-14-pi-sdk-runtime-migration-plan.md`](./2026-04-14-pi-sdk-runtime-migration-plan.md)
- [`docs/adr/2026-04-14-pi-runner-contract.md`](../adr/2026-04-14-pi-runner-contract.md)

Research references:

- [`.research/openai-agents-python/README.md`](../../.research/openai-agents-python/README.md)
- [`.research/openai-agents-python/AGENTS.md`](../../.research/openai-agents-python/AGENTS.md)
- [`.research/openai-agents-python/src/agents/run.py`](../../.research/openai-agents-python/src/agents/run.py)
- [`.research/openai-agents-python/src/agents/run_internal/`](../../.research/openai-agents-python/src/agents/run_internal)
- [`.research/openai-agents-python/src/agents/sandbox/session/`](../../.research/openai-agents-python/src/agents/sandbox/session)

## Purpose

This plan describes how Symphony should adopt the best structural ideas from the OpenAI Agents Python SDK without turning Symphony into an OpenAI-specific product.

The target is not "use OpenAI's hosted runtime."

The target is:

- copy the durable runtime shape
- keep Pi as the only runtime
- keep Docker as the only sandbox
- keep Symphony's router
- keep Symphony's Linear/ticket orchestration
- keep Symphony's canonical run, turn, tool, diff, and operator observability

We want the runtime architecture.

We do not want the provider lock-in.

## Executive Summary

The OpenAI Agents Python SDK is valuable here because it demonstrates a cleaner separation between:

- public runner entrypoints
- internal run-loop mechanics
- turn preparation and turn resolution
- tool execution
- session persistence
- sandbox session management

Symphony currently has those same ideas, but too many of them are collapsed into a few oversized files in `apps/api`, `packages/agent-harnesses`, and `packages/workspace`.

The adoption strategy should be:

1. split our current boundaries so ownership is explicit
2. copy the OpenAI-style runtime structure
3. map that structure onto Pi + Docker
4. leave router, tracker, and orchestrator semantics above the runtime layer
5. delete obsolete runtime internals aggressively once parity is reached

## What We Are Copying

These are the OpenAI Agents SDK ideas we should intentionally adopt.

### 1. Thin public runtime entrypoint

The Python repo explicitly keeps `src/agents/run.py` as the public entrypoint and moves deeper runtime mechanics into `run_internal/`.

Symphony should adopt the same discipline:

- one public Pi runtime entry surface
- one public sandbox/session facade
- internal runtime mechanics moved into internal modules

We should stop treating one giant file as the runtime.

### 2. Internal runtime modules organized by responsibility

The Python repo splits runtime logic into modules like:

- `run_loop.py`
- `turn_preparation.py`
- `turn_resolution.py`
- `tool_execution.py`
- `tool_planning.py`
- `session_persistence.py`
- `streaming.py`

That is the biggest structural lesson to copy.

Symphony needs the same kind of internal runtime directory, in TypeScript, even though the underlying agent is Pi.

### 3. Explicit sandbox session model

The Python repo has a real sandbox/session surface under `src/agents/sandbox/session/`.

Symphony should do the same with Docker-backed workspaces.

We need a clear session model for:

- command execution
- file operations
- patch application
- workspace snapshotting
- event sinks
- heartbeat and timeout supervision

### 4. Explicit item/event/result vocabulary

The Python repo coordinates item and event shapes across:

- run items
- stream events
- turn resolution
- tool execution
- run state serialization

Symphony should apply the same discipline:

- one canonical runtime event vocabulary
- one canonical terminal result vocabulary
- one canonical tool outcome vocabulary

### 5. Streaming and non-streaming parity

The Python repo explicitly treats streaming and non-streaming alignment as a real maintenance concern.

Symphony should do the same.

Today, our product is largely stream-driven. Even so, we should structure the runtime so the final result path and the live event path are not two separate interpretations of execution.

### 6. Tool timeout semantics as a first-class runtime concern

The Python repo has explicit timeout behavior for tools.

That fits our direction directly.

Symphony should preserve:

- transport timeout
- tool timeout
- sandbox exec timeout
- idle stall
- explicit terminal completion

but those should live in explicit runtime modules instead of being inferred from one large supervision file.

## What We Are Not Copying

We should be equally explicit about what stays out of scope.

### 1. OpenAI model/provider coupling

We are not switching the product to OpenAI models.

Pi remains the only runtime.

### 2. OpenAI hosted tools or tracing backend

We do not need:

- OpenAI hosted MCP tools
- OpenAI tracing processors
- OpenAI server-managed conversation IDs

We can preserve our own observability, persistence, and operator read model.

### 3. OpenAI sandbox providers

We do not need E2B or Modal.

Docker remains the only supported sandbox.

### 4. Multi-agent/handoff complexity as an immediate feature

The OpenAI runtime supports handoffs and agents-as-tools.

That is useful inspiration, but not the next product slice.

For Symphony's current product, the higher-order routing layer is the router, not a nested multi-agent SDK feature.

## Current Symphony Pain Points

These are the concrete problems this adoption plan is intended to solve.

### 1. Runtime supervision is too concentrated in `apps/api`

Too much runtime intelligence currently lives in:

- `apps/api/src/core/agent-harness-runtime.ts`
- `apps/api/src/core/runtime-services.ts`

Those should coordinate runtime behavior, not define every detail of it.

### 2. Harness internals are too monolithic

The Pi harness currently has major concentration in:

- `packages/agent-harnesses/src/pi/runner-client.ts`
- `packages/agent-harnesses/src/pi/runner-entrypoint.ts`

That makes it hard to reason about:

- handshake
- event flow
- terminal result mapping
- timeout behavior

as separate concepts.

### 3. Workspace/session semantics are not explicit enough

`packages/workspace/src/docker-workspace-backend.ts` does too much inline.

We need a first-class session model, not just a backend with many helper functions.

### 4. Runtime state and product state are too tightly interleaved

Router/orchestrator/ticket semantics are stronger now than before, but runtime internals can still bleed upward.

The OpenAI structure is useful because it separates:

- run mechanics
- session mechanics
- state persistence
- public orchestration

Symphony needs the same separation.

## Target Runtime Shape For Symphony

The target runtime architecture should look like this.

### Product layer

- `packages/router`
- `packages/orchestrator`
- `packages/tracker`
- `apps/api` operator surfaces

Responsibilities:

- decide what should run
- advance issue lifecycle
- communicate with Linear/operator

### Runtime coordination layer

- `apps/api/src/core/runtime-supervision/`

Responsibilities:

- claim work
- start runner
- persist canonical facts
- interpret runtime outcomes for orchestrator use

### Runtime execution layer

- `packages/agent-harnesses/src/pi/`

Responsibilities:

- run loop
- turn preparation
- turn resolution
- stream normalization
- terminal result translation
- timeout classification inputs

### Sandbox/session layer

- `packages/workspace/src/session/`
- `packages/workspace/src/docker/`

Responsibilities:

- create and manage Docker workspace sessions
- execute commands
- apply patches
- manage workspace mounts and snapshots
- emit sandbox session events

### Persistence and observability layer

- `packages/db`
- `packages/agent-analytics`
- `packages/forensics`

Responsibilities:

- store canonical runtime facts
- derive operator/read-model summaries

## OpenAI-Python-To-Symphony Mapping

This is the concrete module mapping we should use as a guide.

### Public runner

OpenAI Python:

- `src/agents/run.py`

Symphony target:

- `packages/agent-harnesses/src/pi/runner.ts`

Purpose:

- public Pi runtime entry surface
- shallow composition only

### Run loop

OpenAI Python:

- `src/agents/run_internal/run_loop.py`

Symphony target:

- `packages/agent-harnesses/src/pi/internal/run-loop.ts`

Purpose:

- coordinate turns
- resolve whether to continue
- route event flow through a common lifecycle

### Turn preparation

OpenAI Python:

- `src/agents/run_internal/turn_preparation.py`

Symphony target:

- `packages/agent-harnesses/src/pi/internal/turn-preparation.ts`

Purpose:

- prepare the next prompt turn
- shape run context, prior items, and tool availability

### Turn resolution

OpenAI Python:

- `src/agents/run_internal/turn_resolution.py`

Symphony target:

- `packages/agent-harnesses/src/pi/internal/turn-resolution.ts`

Purpose:

- consume Pi output/events
- extract tool requests, text items, reasoning items, and terminal candidates

### Tool execution

OpenAI Python:

- `src/agents/run_internal/tool_execution.py`
- `src/agents/run_internal/tool_planning.py`

Symphony target:

- `packages/agent-harnesses/src/pi/internal/tool-execution.ts`
- `packages/agent-harnesses/src/pi/internal/tool-planning.ts`

Purpose:

- run tool calls
- classify tool outcomes
- apply timeout behavior

### Streaming alignment

OpenAI Python:

- `src/agents/run_internal/streaming.py`

Symphony target:

- `packages/agent-harnesses/src/pi/internal/stream-events.ts`
- `packages/agent-harnesses/src/pi/internal/transcript-assembler.ts`

Purpose:

- keep live events and terminal results aligned

### Session persistence

OpenAI Python:

- `src/agents/run_internal/session_persistence.py`

Symphony target:

- `apps/api/src/core/runtime-supervision/runtime-session-projection.ts`
- `packages/db/src/runtime/`

Purpose:

- persist canonical run/turn facts
- restore enough runtime context for resumes

This is intentionally not a pure harness concern in Symphony because durable state remains a control-plane responsibility.

### Sandbox session

OpenAI Python:

- `src/agents/sandbox/session/manager.py`
- `src/agents/sandbox/session/base_sandbox_session.py`
- `src/agents/sandbox/session/events.py`
- `src/agents/sandbox/session/sinks.py`

Symphony target:

- `packages/workspace/src/session/session-manager.ts`
- `packages/workspace/src/session/base-workspace-session.ts`
- `packages/workspace/src/session/session-events.ts`
- `packages/workspace/src/session/session-sinks.ts`

Purpose:

- formalize Docker workspace sessions as a first-class runtime substrate

## Proposed Implementation Phases

These phases are intentionally broad. Each one can be broken into smaller implementation slices later.

### Phase 0: Structural prep

Dependency:

- complete the package-boundary splits from [`2026-04-15-package-boundary-division-plan.md`](./2026-04-15-package-boundary-division-plan.md)

Why this comes first:

If we skip this, the OpenAI-style internal modules will just be forced into files that are already carrying too much authority.

### Phase 1: Freeze the public Pi runtime surface

Deliverables:

- `packages/agent-harnesses/src/pi/runner.ts`
- explicit public runner interface
- explicit internal module boundary

Goal:

- one place to enter Pi execution
- no new features added to ad hoc deep runtime files

### Phase 2: Introduce `internal/` runtime modules in TypeScript

Deliverables:

- `internal/run-loop.ts`
- `internal/turn-preparation.ts`
- `internal/turn-resolution.ts`
- `internal/tool-execution.ts`
- `internal/tool-planning.ts`
- `internal/stream-events.ts`

Goal:

- mirror the OpenAI internal structure using Pi semantics

### Phase 3: Introduce a formal workspace session model

Deliverables:

- `packages/workspace/src/session/`
- session manager
- session events
- session sink abstraction

Goal:

- make Docker workspace operations look like explicit session behavior instead of helper calls spread across a backend file

### Phase 4: Align runtime events and terminal results

Deliverables:

- one canonical event vocabulary
- one canonical terminal result translator
- one canonical failure-class vocabulary

Goal:

- the runtime should not need to infer completion from silence or mixed transport clues

### Phase 5: Move durable runtime projection out of monolithic supervision files

Deliverables:

- runtime session projection module
- run/turn persistence helpers grouped by area
- clear resume path

Goal:

- the harness emits runtime facts
- the API persists and interprets those facts
- the orchestrator consumes explicit outcomes

### Phase 6: Delete obsolete transport scaffolding aggressively

Deliverables:

- remove old transport code that is no longer needed
- remove compatibility helpers that only exist for the old shape

Goal:

- do not preserve multiple runtime mental models in the codebase

### Phase 7: Expand runtime-focused E2E coverage

Deliverables:

- transcript-driven runtime fixtures
- session-driven fixtures
- timeout/outcome/resume coverage

Goal:

- prove the new runtime shape with realistic flows before broader product changes land on top

## Risks And Tensions

These are the main risks to watch.

### Risk 1: Copying implementation instead of architecture

We should not transliterate Python files into TypeScript just because the names line up.

The right move is to copy:

- ownership
- separation of concerns
- state model discipline

and then implement those ideas in a Pi + Docker + Symphony-specific way.

### Risk 2: Letting runtime internals absorb product semantics

The runtime should not start deciding:

- tracker comments
- workflow transitions
- router module choice

Those stay above the runtime layer.

### Risk 3: Over-copying OpenAI-specific concepts

We do not need:

- server-managed conversation trackers
- hosted tracing
- provider-level approval semantics

If a concept only exists to support OpenAI hosted behavior, it should be excluded unless it also clarifies our Pi runtime directly.

### Risk 4: Failing to preserve observability

One reason to stay with our own runtime stack is that we care about:

- run history
- turn history
- command results
- tool outcomes
- diffs
- runtime failure classes

The refactor is only successful if that operator observability stays first-class.

## Acceptance Criteria

This adoption plan is successful when:

- Symphony has a thin public Pi runner surface at `packages/agent-harnesses/src/pi/runner.ts`
- runtime internals live in named internal modules instead of large mixed files
- Docker workspace sessions are explicit first-class runtime objects
- terminal completion, timeouts, and tool outcomes are represented by typed runtime concepts
- router/orchestrator/tracker semantics remain above the runtime boundary
- obsolete runtime scaffolding is deleted, not kept around as a second truth

## Immediate Recommendation

After the package-boundary prep work, the first real adoption slice should be:

1. introduce a public `runner.ts` for Pi
2. create `internal/run-loop.ts`, `turn-preparation.ts`, and `turn-resolution.ts`
3. move existing logic into those modules without changing product behavior

Status note:

- the public `runner.ts` surface now exists
- the public client/entrypoint/process/contract files now use `runner-*` names instead of `sdk-runner-*`
- the Docker workspace image now ships the stable wrapper executable `symphony-pi-runner`

That gives the repository the OpenAI-style shape early, before deeper runtime behavior changes start.
