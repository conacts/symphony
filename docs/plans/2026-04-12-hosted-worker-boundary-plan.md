# Hosted Worker Boundary Plan

## Purpose

This document turns the execution and orchestration research into a concrete
implementation plan for separating the control plane from worker execution.

The goal is to keep Symphony’s workflow authority in the control plane while
making worker execution swappable, hosted-safe, and easier to reason about.

This is not a general abstraction exercise.
The intent is to hard-cut local process assumptions out of the control plane
boundary without widening the product surface prematurely.

## Target Boundary

The control plane should own:

- workflow history
- routing decisions
- lifecycle authority
- repository and tenant binding
- worker session creation and teardown decisions
- failure classification and retry policy

The worker boundary should own:

- local Docker or Pi execution details
- process launch and teardown mechanics
- workspace materialization
- per-session runtime logs and debug artifacts
- result emission back to the control plane

The control plane should never need to know whether the worker is Docker,
Pi, cloud sandbox, or another hosted runtime.

## What This Plan Cuts

This plan assumes we are intentionally removing the following from the control
plane path:

- direct Docker/Pi launch logic
- local process orchestration as a first-class API
- workspace mount and host file system assumptions
- worker-specific launch targets leaking into orchestration types
- control-plane code that depends on concrete runtime mechanics

The local worker path is not being deleted immediately.
It is being extracted behind a boundary so the control plane can stop
depending on it.

## Dependency Order

The slices below should be implemented in order because each one tightens the
next layer’s contract.

1. Define the worker session contract.
2. Extract the local Docker/Pi execution path behind an adapter.
3. Narrow orchestrator/runtime ownership to control-plane decisions only.
4. Make failure semantics explicit and authoritative.
5. Cut over the control plane to the adapter and remove shadow assumptions.

## Slice 1: Worker Session Contract

### Goal

Define the minimum contract the control plane needs to create, observe, and
close a worker session without knowing how the worker is implemented.

### Contract Shape

The worker session contract should express:

- session identity
- repository/workspace binding
- workflow or route identity
- launch configuration
- runtime capability summary
- lifecycle status
- emitted events
- terminal result
- stop/cancel request handling
- retryability or irrecoverability

### Required Semantics

The control plane should be able to ask:

- start a session
- observe a session
- emit a session event
- stop a session
- report completion or failure

It should not need to ask:

- what container image to use
- how the workspace is mounted
- how the process is spawned
- whether the runtime is local or hosted

### Hard Cut

Any worker API that returns a local-process primitive directly to the control
plane should be considered out of scope for the new boundary.

### Exit Criteria

- a session contract exists as the sole interaction surface between control
  plane and worker execution
- the contract contains no Docker/Pi-specific launch mechanics
- the control plane can express start/stop/status/result flows using only the
  contract

## Slice 2: Extract The Local Docker/Pi Path

### Goal

Move the current local execution path into a worker adapter so the control
plane no longer owns concrete launch logic.

### What To Extract

Extract everything that currently:

- creates or launches the local worker process
- manages local runtime startup or teardown
- couples workspace setup to worker execution
- assumes host-mounted paths are part of the runtime API
- translates runtime commands into local process operations

### Resulting Shape

After extraction, the local path should look like one adapter implementation of
the worker session contract, not the shape of the system.

That adapter may still run Docker or Pi locally.
The important change is that the control plane talks to the adapter contract,
not to Docker/Pi directly.

### Hard Cut

The control plane must stop importing or depending on local launch primitives
once the adapter exists.

If a control-plane module still needs a Docker/Pi concept to route a session,
the extraction is incomplete.

### Exit Criteria

- the local execution path is behind a worker adapter boundary
- control-plane code no longer depends on local launch details
- local Docker/Pi remains available only as an implementation of the adapter

## Slice 3: Orchestrator And Runtime Adapter Boundaries

### Goal

Make orchestrator and runtime modules consume the worker adapter and stop
owning execution mechanics directly.

### Boundary Rules

The orchestrator may own:

- lifecycle transitions
- routing decisions
- claim/release semantics
- retry and rehydration policy
- session creation requests

The orchestrator may not own:

- process launch mechanics
- workspace mount mechanics
- container-specific settings
- worker transport details
- worker implementation selection beyond the adapter contract

### Adapter Boundary

The runtime boundary should become a narrow translation layer that:

- converts control-plane decisions into worker session requests
- converts worker events into lifecycle signals
- preserves workflow history as authority
- never invents fallback runtime behavior

### Hard Cut

If the orchestrator can still reach into runtime internals to make the worker
start, stop, or recover, the boundary is still too wide.

### Exit Criteria

- orchestrator code only depends on the session contract
- runtime code only translates between control-plane signals and the adapter
- worker implementation details are isolated behind one adapter seam

## Slice 4: Failure Semantics

### Goal

Make the hosted boundary fail fast and predictably when worker execution or
adapter translation fails.

### Required Failure Classes

The plan should distinguish:

- bootstrap failure
- adapter configuration failure
- session creation failure
- session heartbeat or observation failure
- terminal worker failure
- cancellation or stop failure
- rehydration or resume failure

### Rules

- bootstrap should fail before a session starts if required bindings are
  missing
- a failed session creation attempt should not silently leave the control
  plane in a claimed state
- a failed observation path should not advance lifecycle authority
- retryable failures must be explicitly classified
- irrecoverable failures must stop the workflow with a visible reason

### Hard Cut

No failure should be normalized into a success path just to keep the flow
moving.

If the control plane cannot prove the next state, it should stop and surface
the error.

### Exit Criteria

- failure classification is explicit in the adapter boundary
- claim/release semantics are correct on all failure paths
- session resume and retry behavior are deterministic after a failure

## Slice 5: Control-Plane Cutover

### Goal

Make the control plane use the new adapter path everywhere relevant and remove
the remaining shadow assumptions about the local worker model.

### Scope

This slice should remove any last control-plane reads that still depend on:

- Docker/Pi specifics
- local workspace assumptions
- runtime launch targets as authority
- direct process management in control-plane code

### Hard Cut

After cutover, the worker implementation should be replaceable without
changing lifecycle authority, workflow history, or routing semantics.

If a worker change requires a control-plane behavior change, the boundary is
still not sharp enough.

### Exit Criteria

- control plane only sees the worker adapter contract
- local worker implementation remains one adapter, not a special case
- workflow history remains the only lifecycle authority

## Non-Goals

This plan does not include:

- a general-purpose plugin marketplace for user-authored workers
- broad UI redesign
- hosted cloud sandbox implementation
- local compatibility preservation for all old execution paths
- a second abstraction layer beyond the worker session contract
- a rewrite of unrelated packages

## Implementation Notes

The safest implementation order is:

1. define the contract
2. extract the local worker path
3. narrow orchestrator/runtime ownership
4. harden failures
5. cut over the control plane and delete shadow assumptions

That order keeps the boundary strict before hosted execution becomes more
diverse.

## Definition Of Done

This work is complete when all of the following are true:

- the control plane can create and manage worker sessions without knowing the
  runtime implementation
- the local Docker/Pi path is an adapter, not an assumption
- failure semantics are explicit and fail fast
- the orchestrator and runtime layers only own control-plane decisions
- no control-plane module depends on process-launch mechanics

