# Symphony Engineering Creed

## Core Principles

- Prefer explicit flows over clever abstractions.
- Apply clean code principles consistently: small units, direct naming, shallow control flow, obvious ownership.
- Optimize for code that is easy to reason about, not code that is merely flexible.
- One concept should have one meaning and, when practical, one name.
- Preserve existing repo naming standards unless a real correctness issue requires a change.
- Assert invariants aggressively when code reaches a state that should be impossible.

## Data Model And Database

- Fail fast. Required data should be required in the type system, at the API boundary, and in the database.
- Fields should be required by default. Optionality must be justified by a real product or runtime condition.
- Build a strong core data model first, then make surrounding code conform to it.
- Do not invent fallback identities. No `"default"` repository keys, no silent derivation from path segments, no made-up control-plane values.
- Prefer `NOT NULL`, foreign keys, `CHECK` constraints, and unique constraints over read-side repair logic.
- Invalid state should be rejected at write time instead of normalized later.
- Reduce redundancy by default. Duplicate identity or state only when it is an intentional read-model cache with a clear owner.
- Keep raw external payloads raw only in raw/artifact storage. Keep canonical Symphony models canonical in control-plane storage.

## Architecture

- Maintain a single source of truth for control-plane state.
- Do not let projections, caches, or analytics tables become lifecycle authority.
- Separate product/runtime truth from raw harness/debug artifacts.
- Prefer deleting shadow authority over teaching more readers how to reconcile it.

## Legacy And Compatibility

- We do not preserve legacy code, legacy schema ideas, or stale compatibility paths by default.
- Remove dead code, unused tables, outdated migrations, stale helpers, and compatibility shims as soon as they are no longer needed.
- Backward compatibility is not a goal unless explicitly stated for a concrete external contract.

## Refactors

- Larger refactors are acceptable when they produce cleaner semantics, stronger invariants, and less ambiguity.
- Broad semantic, naming, or contract refactors must be called out before they spread through the codebase.
- Prefer surgical enforcement work over repo-wide naming churn.
- If a distinction only matters at one boundary, keep it at that boundary.

## Testing And Verification

- Strengthening a contract should be accompanied by tests that prove the stricter behavior.
- Prefer tests that validate invariants and failure modes, not only happy paths.
- When tightening schema or runtime contracts, let broken callers fail in tests and repair them explicitly.
- Use assertions to expose violated assumptions early during development instead of silently carrying invalid state forward.

## Practical Rules

- Require explicit repository context where runtime routing depends on it.
- Prefer one canonical parent existence check for each API surface.
- Return `404` only when the canonical parent is missing.
- Return `200` with empty collections when the parent exists and the child set is empty.
- Do not hide missing or malformed state behind normalization unless the behavior is explicitly intentional and documented.
