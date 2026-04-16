# Pi SDK Runtime Migration Plan

Date: 2026-04-14

Status: Draft

Audience:

- Symphony maintainers
- Symphony runtime implementers
- Symphony router and orchestration implementers
- Future contributors trying to understand why the Pi transport layer was replaced

Related documents:

- [`docs/plans/2026-04-13-router-hardening-and-e2e-stabilization-plan.md`](2026-04-13-router-hardening-and-e2e-stabilization-plan.md)
- [`docs/plans/2026-04-13-intelligent-module-router-roadmap.md`](2026-04-13-intelligent-module-router-roadmap.md)
- [`docs/architecture/symphony-runtime-operations.md`](../architecture/symphony-runtime-operations.md)
- [`docs/architecture/docker-workspace-backend.md`](../architecture/docker-workspace-backend.md)
- [`docs/adr/2026-04-02-docker-only-execution.md`](../adr/2026-04-02-docker-only-execution.md)
- [`docs/adr/2026-04-08-runtime-result-command-contract.md`](../adr/2026-04-08-runtime-result-command-contract.md)
- [`docs/architecture/2026-04-14-intelligent-flow-golden-truth.md`](../architecture/2026-04-14-intelligent-flow-golden-truth.md)

External research references:

- [Pi SDK docs: `packages/coding-agent/docs/sdk.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
- [OpenClaw embedded Pi runner](https://github.com/openclaw/openclaw/blob/main/src/agents/pi-embedded-runner/run/attempt.ts)

## Purpose

This document defines the migration plan for replacing Symphony's current Pi RPC transport implementation with a Pi SDK-backed runtime.

The central idea is straightforward:

- keep Symphony's router
- keep Symphony's orchestration model
- keep Symphony's Docker workspace boundary
- keep Symphony's canonical analytics and read models
- remove the custom Pi CLI JSON/RPC transport and turn-completion inference layer
- replace it with a thinner, typed adapter over the Pi SDK

This plan exists because the current runtime has become one of the main sources of product instability.

The router direction is correct.

The current execution seam is not.

## Executive Summary

Symphony currently runs Pi through a custom transport that:

- launches Pi inside Docker
- writes JSON commands to stdin
- waits for Pi RPC messages over stdout
- decodes tool and turn events
- infers whether a turn really finished
- classifies some ambiguous runs as `pi_no_progress_turn` or `pi_queue_only_turn`

That transport worked well enough to unlock observability and routing work.

It also introduced avoidable complexity:

- transport semantics are mixed with business completion semantics
- timeout handling is too coarse
- completion inference is brittle
- there are effectively multiple Pi execution paths in the codebase
- the runtime has too much custom state-management logic for something the Pi SDK already knows how to manage

Research into OpenClaw confirms that a cleaner approach is viable today.

OpenClaw uses the Pi SDK directly:

- `SessionManager`
- `createAgentSession(...)`
- direct session prompting via `activeSession.prompt(...)`
- direct steering via `activeSession.steer(...)`
- stream subscription
- explicit `stopReason`
- explicit `pendingToolCalls`
- explicit idle-timeout wrapping

That is the shape Symphony should move toward.

The migration target is not:

- "delete Symphony runtime"

The migration target is:

- "delete the custom Pi RPC transport"
- "replace it with a Pi SDK runner behind the existing Symphony harness boundary"

## The Main Decision

We should make the following runtime decision explicit.

### Keep

- Symphony router selection and lifecycle orchestration
- Symphony Docker-backed workspace execution model
- Symphony canonical run, turn, tool-call, and diff analytics
- Symphony control-plane lifecycle events
- Symphony workflow observability APIs and read models

### Remove

- Pi CLI RPC process management
- Pi RPC event decoder
- Pi RPC turn completion inference
- Pi-specific "queue only" and "no progress" turn heuristics as the primary completion model
- duplicate app-server transport logic once the SDK runner is proven

### Replace

- the current Pi transport implementation with an SDK-backed runner

### Do Not Introduce

- another runtime provider
- another sandbox provider
- another lifecycle authority
- a second analytics truth
- truncated patch or diff text as durable storage truth

## Why This Is The Right Priority

This migration is the correct top priority because it simplifies multiple problem areas at once.

### It simplifies runtime completion

Right now we are often asking:

- did Pi actually finish
- did the process stall
- did the process emit only queue updates
- did the process end after `turn_end` but before `agent_end`
- do we need to poll the transport again

That is transport debt.

The Pi SDK already has a stronger notion of:

- session
- prompt
- stream
- stop reason
- tool activity
- abort

### It simplifies timeout handling

We need explicit failure classes.

The SDK path makes it easier to separate:

- transport timeout
- model idle timeout
- full-run timeout
- tool timeout
- explicit abort
- invalid terminal result
- missing terminal result

### It simplifies the code surface

The current transport logic is spread across several files and concepts:

- [`apps/api/src/core/runtime-harness.ts`](../../apps/api/src/core/runtime-harness.ts)
- [`packages/agent-harnesses/src/pi/definition.ts`](../../packages/agent-harnesses/src/pi/definition.ts)
- [`packages/agent-harnesses/src/pi/rpc-process.ts`](../../packages/agent-harnesses/src/pi/rpc-process.ts)
- [`packages/agent-harnesses/src/pi/rpc-client.ts`](../../packages/agent-harnesses/src/pi/rpc-client.ts)
- [`packages/agent-harnesses/src/pi/event-decoder.ts`](../../packages/agent-harnesses/src/pi/event-decoder.ts)
- [`apps/api/src/core/agent-app-server-client.ts`](../../apps/api/src/core/agent-app-server-client.ts)
- [`apps/api/src/core/agent-app-server-launch.ts`](../../apps/api/src/core/agent-app-server-launch.ts)

We should reduce that to:

- one Pi runtime path
- one container launch boundary
- one event mapping layer
- one completion classifier

### It improves the foundation for E2E testing

If the runtime seam is explicit and typed, our `.e2e.test.ts` suite becomes easier to build.

We can mock:

- SDK stream events
- stop reasons
- tool calls
- tool failures
- completion payloads
- router-visible runtime outcomes

That is much cleaner than mocking a transport protocol that already bakes in ambiguity.

## Current State

We should be precise about what exists today.

### Runtime harness seam

`createPiRuntimeHarness()` is already the correct boundary.

Current file:

- [`apps/api/src/core/runtime-harness.ts`](../../apps/api/src/core/runtime-harness.ts)

This is good.

We should preserve the harness seam and replace the transport under it.

### Pi transport module

Current files:

- [`packages/agent-harnesses/src/pi/definition.ts`](../../packages/agent-harnesses/src/pi/definition.ts)
- [`packages/agent-harnesses/src/pi/rpc-process.ts`](../../packages/agent-harnesses/src/pi/rpc-process.ts)
- [`packages/agent-harnesses/src/pi/rpc-client.ts`](../../packages/agent-harnesses/src/pi/rpc-client.ts)
- [`packages/agent-harnesses/src/pi/event-decoder.ts`](../../packages/agent-harnesses/src/pi/event-decoder.ts)

The current model:

- spawn Docker
- run Pi command
- write commands
- wait for events
- decode events
- project events
- infer finality

This is the layer we should delete.

### App-server path

Current files:

- [`apps/api/src/core/agent-app-server-client.ts`](../../apps/api/src/core/agent-app-server-client.ts)
- [`apps/api/src/core/agent-app-server-launch.ts`](../../apps/api/src/core/agent-app-server-launch.ts)
- [`apps/api/src/core/agent-app-server-protocol.ts`](../../apps/api/src/core/agent-app-server-protocol.ts)

This path currently provides useful typed tool call events.

It is still transport duplication.

The long-term target should be:

- no Pi CLI RPC path
- no separate Pi app-server path
- one SDK-backed runner path

### Analytics and read model

Current canonical surfaces worth preserving:

- [`packages/contracts/src/domain/agent-analytics/responses.ts`](../../packages/contracts/src/domain/agent-analytics/responses.ts)
- [`packages/db/src/agent-analytics-store.ts`](../../packages/db/src/agent-analytics-store.ts)
- [`packages/db/src/agent-analytics-read-store.ts`](../../packages/db/src/agent-analytics-read-store.ts)
- [`packages/orchestrator/src/symphony-orchestrator.ts`](../../packages/orchestrator/src/symphony-orchestrator.ts)
- [`apps/api/src/core/runtime-db-observer.ts`](../../apps/api/src/core/runtime-db-observer.ts)
- [`apps/api/src/core/agent-harness-runtime.ts`](../../apps/api/src/core/agent-harness-runtime.ts)

The migration should conform to these layers rather than replace them.

### Storage truncation that should be revisited

Current diff storage is already closer to the desired model for Pi edit and write tools:

- preview on the main row
- overflow record for full text

Relevant file:

- [`packages/db/src/agent-analytics-store.ts`](../../packages/db/src/agent-analytics-store.ts)

Current repo snapshot patch capture still truncates the patch itself.

Relevant file:

- [`apps/api/src/core/agent-repo-snapshot.ts`](../../apps/api/src/core/agent-repo-snapshot.ts)

That does not match the product direction.

We should store full patch text as truth and derive previews from it.

## Research Findings From OpenClaw And The Pi SDK

The OpenClaw research matters because it proves the Pi SDK path is not hypothetical.

### What OpenClaw is doing

OpenClaw:

- opens a `SessionManager`
- prepares the session for a run
- builds settings and resources
- creates the agent session with `createAgentSession(...)`
- subscribes to live session events
- wraps the stream with an idle timeout
- calls `activeSession.prompt(...)`
- derives explicit `stopReason`
- exposes `pendingToolCalls`

### What this tells us

The Pi SDK already has better native concepts for:

- session lifecycle
- prompt submission
- streaming output
- abort behavior
- terminal reasoning
- provider stop reasons

The current Symphony transport is manually reconstructing concepts the SDK already exposes.

### What we should borrow

- SDK session ownership
- stream wrappers for idle timeout
- stop-reason normalization
- explicit pending-tool-call handling
- session-local context truncation when necessary for model input only

### What we should not copy blindly

- OpenClaw's broader product/runtime assumptions
- any non-Docker sandboxing choice
- any logging reduction that would remove Symphony's router-facing observability
- any storage truncation policy that turns previews into truth

## The Target Architecture

The target architecture should be simple enough to describe in one sentence:

- Symphony launches a Docker-contained Pi SDK runner and consumes a typed Symphony runtime event stream from it.

That sentence matters.

It means the SDK becomes the execution engine.

It does not mean the SDK becomes the control plane.

## Hard Requirements

The migration must preserve the following constraints.

### Requirement 1

Pi remains the only runtime.

### Requirement 2

Docker remains the only sandbox boundary.

### Requirement 3

The router remains the only next-step authority.

### Requirement 4

The database and read models remain Symphony-owned.

### Requirement 5

All runtime outcomes must be typed and explicit.

### Requirement 6

Full diff and patch text must remain available as durable truth.

### Requirement 7

The runtime must be testable without dogfooding live tickets.

## Architecture Decision

We should reject a host-side in-process SDK runner.

We should adopt an in-container SDK runner bridge.

## Why We Should Reject A Host-Side SDK Runner

A host-side SDK runner would be simpler in one narrow sense:

- the API could import the SDK directly and run everything in the same process tree

But it conflicts with an important product constraint:

- command execution would no longer naturally occur inside the Docker workspace boundary

That weakens environment parity and muddles the execution model.

It also makes it easier to accidentally leak host assumptions into the runtime.

That is the wrong tradeoff.

## Why We Should Adopt An In-Container SDK Runner Bridge

The recommended shape is:

- Symphony launches a Node entrypoint inside the workspace container
- that entrypoint imports the Pi SDK
- it creates and runs the session
- it emits a Symphony-typed JSONL event stream
- the host consumes that event stream and projects it into the canonical analytics model

This keeps the correct ownership split:

- Docker owns execution isolation
- the Pi SDK owns session mechanics
- Symphony owns orchestration, persistence, analytics, and router-facing semantics

## Proposed Runtime Components

The migration should introduce a cleaner set of runtime concepts.

### 1. Pi SDK runner contract

New concept:

- a typed contract for the bridge between Symphony and the in-container SDK runner

Responsibilities:

- define run input
- define event output
- define terminal result shape
- define failure shape

Candidate file:

- `packages/agent-harnesses/src/pi/runner-contract.ts`

### 2. Pi SDK container launcher

New concept:

- a launcher responsible only for starting the SDK runner inside Docker

Responsibilities:

- choose container command
- pass environment
- pass workspace cwd
- start the bridge process
- capture stdout and stderr
- report bridge startup failure explicitly

Candidate file:

- `packages/agent-harnesses/src/pi/runner-process.ts`

### 3. Pi SDK runtime client

New concept:

- the host-side consumer of Symphony-typed bridge events

Responsibilities:

- parse runner events
- map them into canonical analytics projections
- classify runtime completion
- surface bridge failures separately from agent failures

Candidate file:

- `packages/agent-harnesses/src/pi/runner-client.ts`

### 4. In-container bridge entrypoint

New concept:

- a small Node program run inside the Docker workspace

Responsibilities:

- construct `SessionManager`
- construct session services/settings/resources
- run `createAgentSession(...)`
- stream assistant, reasoning, and tool events
- wrap model idle timeouts
- emit a terminal result

Candidate file:

- `packages/agent-harnesses/src/pi/runner-entrypoint.ts`

This is now packaged into the Docker workspace image behind the stable wrapper
`/usr/local/bin/symphony-pi-runner`, with runner assets rooted under
`/opt/symphony/pi-runner`.

### 5. Completion classifier

New concept:

- one place that converts runner terminal state into Symphony runtime completion

Responsibilities:

- accept successful completion
- accept blocked/input-required completion
- accept router-usable non-terminal end-turn results
- reject malformed or missing terminal signals

Candidate file:

- `apps/api/src/core/pi-sdk-runtime-completion.ts`

## Canonical Event Model For The New Runner

The bridge contract should be more explicit than the current Pi RPC event stream.

At a minimum, the bridge should emit:

- `session_started`
- `prompt_started`
- `assistant_message_started`
- `assistant_text_delta`
- `assistant_reasoning_delta`
- `tool_call_started`
- `tool_call_completed`
- `tool_call_failed`
- `command_started`
- `command_completed`
- `command_failed`
- `file_change_observed`
- `idle_timeout_triggered`
- `run_timeout_triggered`
- `input_required`
- `terminal_result`
- `runner_error`

We do not need every event on day one.

We do need:

- explicit terminal results
- explicit tool success/failure
- explicit timeouts
- explicit operator-input request

## Runtime Failure Classes

The current "stalled" bucket is too blurry.

The replacement runtime should classify failure more precisely.

### Required failure classes

- `runner_startup_failure`
- `bridge_protocol_failure`
- `transport_timeout`
- `model_idle_timeout`
- `run_timeout`
- `tool_timeout`
- `operator_input_required`
- `terminal_result_missing`
- `terminal_result_invalid`
- `provider_error`
- `runtime_crash`

### Optional simplification

If we want fewer terminal concepts, we can intentionally collapse:

- `terminal_result_missing`
- `terminal_result_invalid`

into:

- `terminal_result_failure`

That choice should be explicit in the runtime contract, not accidental in logging.

## Completion Contract

The runtime should stop inferring completion from silence.

That point is critical.

The SDK runner must emit an explicit terminal result that Symphony validates.

### A run should only be considered complete when:

- the SDK session reached a terminal stop condition
- the bridge emitted a `terminal_result`
- the `terminal_result` passed validation
- the module outcome, if required, is present and valid

### A run should not be considered complete merely because:

- streaming stopped
- a process exited
- a timeout did not fire
- a `turn_end`-like concept was observed

That is how we reduce false stalls and false completions.

## Logging And Observability Requirements

This migration is not permission to weaken observability.

We should simplify transport internals while making runtime outcomes more explicit.

### Logs we must keep

- current module or run context
- last agent activity source
- last agent activity timestamp
- tool start and finish status
- command start and finish status
- exit code for commands
- validated terminal result
- timeout class
- completion class
- router-visible summary of why the run stopped

### Logs we can reduce

- noisy repetitive polling logs
- duplicate transport-state chatter
- "waiting again" style logs without new information

### Logging standard

Each timeout or failure log should include:

- issue id
- workflow id when available
- run id
- module id when available
- timeout class
- configured threshold
- last visible activity type
- last visible activity timestamp
- next action taken by Symphony

## Storage Requirements For Full Text

We should make the storage policy explicit because this is one of the places where the current code still conflicts with the intended product.

### Rule 1

Full diff text is durable truth.

### Rule 2

Full repo patch text is durable truth.

### Rule 3

Preview fields are derived UI helpers only.

### Rule 4

Context truncation is allowed only for model context management, not for durable observability storage.

### Immediate follow-up changes this plan should drive

- replace `patch_truncated` authority with full patch overflow storage in [`apps/api/src/core/agent-repo-snapshot.ts`](../../apps/api/src/core/agent-repo-snapshot.ts)
- keep `diffPreview` as a convenience field
- ensure `diffOverflowId` always points to the full text when the diff exceeds inline thresholds
- keep read models capable of hydrating full text on demand

## Testing Strategy

This migration should be implemented under a stronger test strategy than the current transport was.

### Unit tests

Test:

- runner event decoding
- stop-reason mapping
- timeout classification
- terminal-result validation
- tool-call event projection
- file-change projection

### Integration tests

Test:

- launching the SDK runner in a fake container process
- host-side consumption of bridge events
- startup failure handling
- invalid bridge event handling
- runtime crash handling

### End-to-end tests

Use `*.e2e.test.ts` files.

Golden paths should include:

- implementation succeeds and router continues
- implementation completes and explicit terminal result is accepted
- implementation requests clarification and awaits user input
- implementation hits a tool failure and is classified correctly
- implementation is idle too long and becomes `model_idle_timeout`
- implementation exceeds full run timeout and becomes `run_timeout`
- implementation emits malformed terminal result and fails as `terminal_result_invalid`

### One live smoke test

Keep one guarded live smoke path for:

- a real container
- a real Pi SDK session
- a simple implementation ticket

But do not rely on live dogfooding as the primary correctness proof.

## Migration Slices

The migration should be done in explicit slices.

## Slice 1: Freeze The Runtime Contract

Deliverables:

- write an ADR for "Pi SDK runner, Docker only, Pi only"
- define the runner input and event output contract
- define failure classes
- define terminal result schema

Files likely touched:

- new ADR under `docs/adr/`
- new contract file under `packages/agent-harnesses/src/pi/`
- tests for the contract shape

Exit condition:

- the runtime contract is written down and testable before implementation spreads

## Slice 2: Add The Pi SDK Dependencies And Runner Skeleton

Deliverables:

- add Pi SDK packages to the workspace dependencies
- create the in-container runner entrypoint
- create a host launcher that starts that runner in Docker

Files likely touched:

- `package.json`
- `pnpm-lock.yaml`
- new `packages/agent-harnesses/src/pi/sdk-*` files

Exit condition:

- Symphony can launch the runner and receive a `session_started` event

## Slice 3: Implement Session Execution Through The SDK

Deliverables:

- construct `SessionManager`
- construct session services/settings/resources
- call `createAgentSession(...)`
- call `session.prompt(...)`
- emit assistant and tool events

Exit condition:

- a simple prompt can run through the SDK runner and return a terminal result

## Slice 4: Implement Timeout And Failure Classification

Deliverables:

- model idle timeout wrapper
- full run timeout handling
- explicit bridge protocol failures
- explicit runtime crash classification

Exit condition:

- no timeout path falls back to a generic ambiguous stall outcome

## Slice 5: Preserve And Improve Analytics Projection

Deliverables:

- project SDK runner events into current canonical analytics rows
- preserve tool success/failure visibility
- preserve file-change visibility
- preserve command exit status

Exit condition:

- existing read-model APIs continue to work against the new event source

## Slice 6: Replace The Old Pi RPC Path

Deliverables:

- switch `createPiRuntimeHarness()` to the new SDK path
- remove `rpc-process.ts`
- remove `rpc-client.ts`
- remove `event-decoder.ts`
- remove Pi RPC-specific tests

Exit condition:

- the default runtime path no longer depends on Pi CLI RPC

## Slice 7: Remove App-Server Duplication

Deliverables:

- retire `agent-app-server-*` Pi transport if the SDK runner now covers all needed semantics
- fold any useful tool-call handling semantics into the runner bridge

Exit condition:

- one Pi transport remains in the codebase

## Slice 8: Upgrade Full-Text Artifact Storage

Deliverables:

- full patch storage for repo snapshots
- no durable truth stored only as truncated text
- previews remain optional and derived

Exit condition:

- UI and forensics can request the full artifact whenever needed

## Slice 9: Rebuild The Golden-Path E2E Suite On The New Runtime

Deliverables:

- transcript or event-fixture-backed `.e2e.test.ts` scenarios
- router-module golden paths using SDK-backed runtime mocks
- explicit terminal-result tests

Exit condition:

- runtime and router behavior can be validated without a live ticket

## Files We Expect To Delete

The following files are strong deletion candidates once the migration is complete:

- [`packages/agent-harnesses/src/pi/rpc-process.ts`](../../packages/agent-harnesses/src/pi/rpc-process.ts)
- [`packages/agent-harnesses/src/pi/rpc-client.ts`](../../packages/agent-harnesses/src/pi/rpc-client.ts)
- [`packages/agent-harnesses/src/pi/event-decoder.ts`](../../packages/agent-harnesses/src/pi/event-decoder.ts)
- [`apps/api/src/core/pi-rpc-client.unit.test.ts`](../../apps/api/src/core/pi-rpc-client.unit.test.ts)

The following files are likely deletion candidates after the new runner reaches parity:

- [`apps/api/src/core/agent-app-server-client.ts`](../../apps/api/src/core/agent-app-server-client.ts)
- [`apps/api/src/core/agent-app-server-launch.ts`](../../apps/api/src/core/agent-app-server-launch.ts)
- [`apps/api/src/core/agent-app-server-protocol.ts`](../../apps/api/src/core/agent-app-server-protocol.ts)

## Files We Expect To Keep But Simplify

- [`apps/api/src/core/runtime-harness.ts`](../../apps/api/src/core/runtime-harness.ts)
- [`packages/agent-harnesses/src/pi/definition.ts`](../../packages/agent-harnesses/src/pi/definition.ts)
- [`apps/api/src/core/agent-harness-runtime.ts`](../../apps/api/src/core/agent-harness-runtime.ts)
- [`packages/orchestrator/src/symphony-orchestrator.ts`](../../packages/orchestrator/src/symphony-orchestrator.ts)
- [`packages/db/src/agent-analytics-store.ts`](../../packages/db/src/agent-analytics-store.ts)
- [`packages/db/src/agent-analytics-read-store.ts`](../../packages/db/src/agent-analytics-read-store.ts)

## Risks

We should be honest about the risks.

### Risk 1

The SDK runner may expose less raw transport detail than the current custom path.

Mitigation:

- keep Symphony-owned event projection
- emit our own bridge events for the details the router and UI actually need

### Risk 2

SDK behavior may differ from current Pi CLI RPC behavior in edge cases.

Mitigation:

- run parity tests for golden paths
- keep the cutover behind a temporary runtime flag until confidence is high

### Risk 3

Container packaging for the SDK runner may introduce setup complexity.

Mitigation:

- start with a simple entrypoint launched via `docker exec`
- defer bundling optimizations until after parity is proven

### Risk 4

We may accidentally weaken analytics projection while simplifying the runtime.

Mitigation:

- write parity tests against current read-model expectations
- explicitly test edit/write diff capture and command exit statuses

## What This Migration Does Not Solve By Itself

This migration is foundational.

It does not, by itself, solve:

- all router policy questions
- all UI layout problems
- all ticket contract strictness questions
- all data-model cleanup in unrelated packages

It does, however, remove one of the largest sources of runtime ambiguity.

That is why it should happen before more router growth.

## Recommended Order Of Execution

If we implement this immediately, the order should be:

1. write the runtime ADR and contract
2. add the SDK runner skeleton in Docker
3. run one prompt end to end through the SDK runner
4. add explicit terminal result validation
5. add timeout and failure-class mapping
6. map tool and file-change events into analytics
7. cut over the default harness
8. delete the old Pi RPC path
9. delete the app-server duplication
10. harden full-text artifact storage
11. lock in `.e2e.test.ts` golden paths

## Final Position

We should stop investing in the current Pi RPC transport.

It was a useful bridge.

It is now the wrong long-term substrate.

The correct direction is:

- Docker only
- Pi only
- SDK-backed execution
- explicit runtime outcomes
- explicit terminal results
- full-text observability storage
- Symphony-owned orchestration and analytics above a much thinner runtime seam

That migration should be treated as the next major implementation program.
