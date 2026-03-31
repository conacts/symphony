# @symphony/contracts

Transport-only HTTP and realtime contract package for the Symphony developer control plane.

## Owns

- Typed request/response and websocket schemas for Symphony transport boundaries.
- Response envelope ownership for Symphony transport payloads.

## Does not own

- Hono route composition.
- Next.js dashboard composition.
- Reusable orchestration logic.
- Legacy business-domain models or persistence semantics.

This package is intentionally scaffolded before the real contract work so later tickets can deepen the transport surface without moving boundaries.
