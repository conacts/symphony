# ADR: Pi SDK Runner Contract

Date: 2026-04-14

## Status

Accepted

## Context

Symphony's current Pi runtime path grew around a transport-first design:

- launch Pi inside Docker
- speak JSON/RPC over stdio
- decode transport events
- infer when a turn really ended
- classify ambiguous cases such as "queue only" or "no progress"

That transport was useful as a bridge.

It is no longer the right long-term execution boundary.

We now have enough evidence from:

- the current Symphony runtime pain
- the need for explicit terminal-result acceptance
- the need for clearer timeout classes
- research into OpenClaw and the Pi SDK

to make a stronger architectural decision.

The router and control plane are not the problem.

The custom Pi transport layer is.

## Decision

Symphony will converge on a Pi SDK-backed runtime runner contract with the following rules:

- Pi is the only supported agent runtime
- Docker is the only supported execution sandbox
- Symphony retains ownership of orchestration, workflow progression, analytics projection, and read models
- the Pi SDK owns session mechanics and prompt execution
- the runtime bridge must emit an explicit typed terminal result
- the runtime bridge must classify failures explicitly instead of collapsing them into a generic stall
- full diff and patch text are durable observability truth; previews are derived helpers only

The contract is defined in:

- [`packages/agent-harnesses/src/pi/sdk-runner-contract.ts`](../../packages/agent-harnesses/src/pi/sdk-runner-contract.ts)

That contract introduces:

- a versioned runner input schema
- a versioned runner event schema
- a versioned terminal result schema
- a fixed failure-class vocabulary for runtime outcomes

## Consequences

Positive:

- the transport rewrite now has one explicit target
- timeout and failure semantics are frozen before behavior changes spread
- runtime completion no longer needs to be inferred from transport silence
- the future SDK runner can remain thin while Symphony keeps its existing control-plane authority
- E2E runtime mocking becomes simpler because the bridge contract is typed and versioned

Negative:

- there is now deliberate short-term duplication between the frozen contract and the still-live RPC transport
- the old Pi RPC path will continue to exist until the SDK runner reaches parity
- some existing runtime code will have to be deleted aggressively once the cutover is complete

## Notes

This ADR does not itself perform the runtime cutover.

It freezes the target that later slices must implement.

The practical implication is:

- no more investment in expanding the old Pi RPC contract
- future runtime work should align to the SDK runner contract first
