# Testing Policy

Symphony tests should exercise real package behavior by default.

## Default

- Prefer real exported APIs, real composition, and real local wiring paths.
- Prefer shared builders from `@symphony/test-support` or package-local test harnesses over ad hoc inline fixtures.
- Prefer temp directories, temp workflow files, and temp SQLite databases over mocked stores when the dependency is local and fast.
- Keep tests deterministic by fixing time, inputs, and filesystem roots.

## Builders First

- Use builders for workflow config, tracker issues, GitHub webhook payloads, runtime snapshots, runtime API envelopes, and forensics result shapes.
- Extend an existing builder before introducing a new one-off fixture.
- Keep view-model tests focused on the shape that matters to the assertion instead of rebuilding full domain objects inline.

## Harnesses

- Use small harnesses to boot real composition in critical-path tests.
- `apps/api` should prefer the runtime app-services harness when verifying runtime boot, poll scheduling, DB-backed logs, and HTTP wiring.
- `packages/runtime` should prefer runtime composition seams when verifying orchestrator behavior through the public runtime facade.

## Mocks

- Mocks and stubs are allowed only at true external boundaries or explicit failure-injection seams.
- Allowed examples: GitHub HTTP, Linear HTTP/GraphQL, network transport, process exit, wall clock, child-process execution, and intentionally injected storage/runtime failures.
- Do not mock internal Symphony modules just to assert that one factory called another.
- If an internal mock is truly necessary, document the boundary and the reason in the test.

## Review Bar

- New tests should not add internal `vi.mock` usage for Symphony packages without a clear justification.
- When refactoring tests, prefer replacing module mocks with builders plus in-memory or temp-environment harnesses on the highest-value runtime paths first.
