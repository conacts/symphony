# Symphony TypeScript Parity And Cutover Readiness

Date: 2026-03-31

## Current Decision

The TypeScript Symphony control plane is **not ready to replace** the Elixir runtime as the active
default today.

The new implementation has strong parity on the operator-facing HTTP, websocket, dashboard, and
forensics surfaces. It does **not** yet have parity on the real tracker, workspace, or Codex
execution paths that make the current Elixir runtime production-useful.

Maintain the TypeScript control plane in evaluation mode and continue to treat `symphony/elixir` as the runtime oracle until the cutover gates in
this document are explicitly satisfied.

## Elixir Oracle

The current oracle remains:

- `symphony/elixir/README.md`
- `symphony/elixir/lib/symphony_elixir_web/router.ex`
- `docs/architecture/symphony-evaluation-setup.md`
- the repo-owned launcher `scripts/symphony/run-local.sh`

Those surfaces define the current admitted V1 behavior we are trying to preserve or replace safely.

## Parity Checklist

### Operator-Facing Parity

- [x] Runtime summary HTTP surface
  Evidence:
  - `apps/api/src/http/app.test.ts`
  - `apps/web/src/core/runtime-summary-client.test.ts`
  - `apps/web/src/components/runtime-summary-view.test.tsx`
- [x] Realtime websocket invalidation model
  Evidence:
  - `apps/api/src/http/realtime.test.ts`
  - `apps/web/src/core/runtime-summary-client.test.ts`
  - `apps/web/src/core/realtime-resource.ts`
- [x] Issue, run, and problem-run forensics drilldowns
  Evidence:
  - `apps/api/src/http/app.test.ts`
  - `apps/web/src/core/forensics-client.test.ts`
  - `apps/web/src/components/issue-detail-view.test.tsx`
  - `apps/web/src/components/problem-runs-view.test.tsx`
  - `apps/web/src/components/run-detail-view.test.tsx`
- [x] Refresh action parity
  Evidence:
  - `apps/api/src/http/app.test.ts`
  - `apps/web/src/core/runtime-operator-client.test.ts`
  - `apps/web/src/components/runtime-refresh-panel.test.tsx`
- [x] Requeue parity through existing GitHub and Linear flows
  Evidence:
  - `apps/api/src/http/serializers.ts`
  - `packages/contracts/src/domain/runtime/runtime.test.ts`
  - `apps/web/src/components/issue-requeue-panel.test.tsx`
- [x] GitHub review ingress transport parity
  Evidence:
  - `apps/api/src/http/app.test.ts`
  - `packages/contracts/src/domain/github-review-events/github-review-events.test.ts`

### Runtime-Critical Parity

- [ ] Real Linear-backed tracker polling and reconciliation
  Current status:
  - `apps/api/src/core/runtime-services.ts` still boots the default runtime with
    `createMemorySymphonyTracker([])`.
  Cutover gate:
  - replace the memory tracker with a real admitted Linear adapter that uses `WORKFLOW.md` config.
- [ ] Real Codex app-server execution
  Current status:
  - `apps/api/src/core/runtime-services.ts` still uses a stub `agentRuntime` that does
    not launch Codex and returns `sessionId: null`.
  Cutover gate:
  - replace the stub runtime with the real Codex app-server orchestration path.
- [ ] Repo-owned workspace bootstrap, validation, and cleanup integration
  Current status:
  - the TypeScript runtime does not yet invoke the repo-owned scripts under `scripts/symphony/`.
  Cutover gate:
  - prove the TypeScript runtime honors the same workspace lifecycle contract the Elixir launcher
    relies on today.
- [ ] Launch-path parity with the current Elixir evaluation loop
  Current status:
  - a TypeScript launch path now exists for evaluation, but it remains operator-surface-only until
    the tracker and agent runtime seams are real.
  Cutover gate:
  - an operator can stop the Elixir process, start the TypeScript runtime and dashboard, and still
    process real Symphony work end to end.

## Validation Evidence

Current evidence command:

```bash
./scripts/symphony/check-typescript-parity.sh
```

That command runs:

```bash
pnpm exec turbo run build lint test typecheck \
  --filter=@symphony/env \
  --filter=@symphony/errors \
  --filter=@symphony/contracts \
  --filter=@symphony/core \
  --filter=@symphony/api \
  --filter=@symphony/web
```

This is necessary evidence for operator-surface parity. It is **not** sufficient evidence for full
runtime cutover because the current runtime still uses a memory tracker and stub agent runtime.

## Local Launch Path For Evaluation

### Runtime

The TypeScript runtime now has a direct local launcher:

```bash
./scripts/symphony/run-typescript-local.sh
```

Expected env source:

- `apps/api/.env.local`
- or exported shell env vars

Minimum env:

- `LINEAR_API_KEY`
- optional overrides:
  - `PORT`
  - `WORKFLOW_PATH`
  - `SYMPHONY_DB_FILE`

The launcher defaults:

- `WORKFLOW_PATH` to the repo-owned `WORKFLOW.md`
- `SYMPHONY_DB_FILE` to `symphony.db`

Equivalent direct package command:

```bash
pnpm --filter @symphony/api dev
```

### Dashboard

Run the dashboard separately:

```bash
pnpm --filter @symphony/web dev
```

Expected env source:

- `apps/web/.env.local`

Minimum env:

- `NEXT_PUBLIC_SYMPHONY_RUNTIME_BASE_URL=http://127.0.0.1:4400`

### Evaluation Boundary

This launch path is good enough to evaluate:

- the Hono runtime transport surface
- the websocket invalidation model
- the Next.js control-plane shell
- runtime summary and forensics drilldowns
- refresh and parity-safe requeue affordances

This launch path is **not** yet good enough to declare full runtime replacement for the Elixir
system.

## Cutover Readiness

### Current Status

**Do not cut over yet.**

### Required Before Cutover

All of the following must be true before the Elixir runtime stops being the active default:

1. The default TypeScript runtime uses a real Linear tracker adapter instead of the in-memory test
   tracker.
2. The default TypeScript runtime launches real Codex app-server sessions instead of the stub
   agent runtime.
3. The TypeScript runtime honors the repo-owned workspace bootstrap, validation, and cleanup
   scripts used by the current evaluation workflow.
4. A local operator can stop `symphony/elixir`, start the TypeScript runtime/dashboard, and retain
   the important day-one behaviors without silent regression.
5. The parity evidence command stays green while the runtime-critical gates above are added.

Until those statements are true, treat the current TypeScript control plane as
**evaluation-ready for UI and transport parity, but not cutover-ready for real orchestration**.
