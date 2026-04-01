# Symphony TypeScript Parity And Cutover Readiness

Date: 2026-03-31

## Current Decision

The TypeScript Symphony control plane backend is now the primary implementation for the repo-owned,
single-host workflow we are validating locally.

The major runtime-critical seams are now real:

- real Linear-backed polling and reconciliation
- real Codex app-server execution
- repo-owned workspace reuse/reset integration
- DB-backed observability and forensics
- live refresh/requeue/operator transport parity

Keep `symphony/elixir` as the comparison oracle for regression audits and behavior checks, but the
remaining work is now hardening, documentation sync, structural cleanup, and UI.

## Elixir Oracle

The current oracle remains:

- `symphony/elixir/README.md`
- `symphony/elixir/lib/symphony_elixir_web/router.ex`
- `docs/architecture/symphony-evaluation-setup.md`
- the repo-owned workflow contract in `WORKFLOW.md`

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

- [x] Real Linear-backed tracker polling and reconciliation
  Evidence:
  - `packages/core/src/tracker/linear-symphony-tracker.ts`
  - `apps/api/src/core/runtime-services.ts`
- [x] Real Codex app-server execution
  Evidence:
  - `apps/api/src/core/codex-agent-runtime.ts`
  - `apps/api/src/core/codex-app-server-client.ts`
  - `apps/api/src/core/codex-agent-runtime.test.ts`
- [x] Repo-owned workspace bootstrap, validation, and cleanup integration
  Evidence:
  - `packages/core/src/workspace/local-symphony-workspace-manager.ts`
  - `packages/core/src/orchestration/symphony-orchestrator.ts`
  - `packages/core/src/workspace/local-symphony-workspace-manager.test.ts`
- [x] Launch-path parity with the current TypeScript evaluation loop
  Evidence:
  - `pnpm --filter @symphony/api build`
  - `pnpm --filter @symphony/api start`
  - live validation against the installed Codex binary plus the API surfaces

## Validation Evidence

Current evidence command:

```bash
pnpm exec turbo run build lint test typecheck \
  --filter=@symphony/env \
  --filter=@symphony/errors \
  --filter=@symphony/contracts \
  --filter=@symphony/core \
  --filter=@symphony/api \
  --filter=@symphony/web
```

This is the current monorepo validation gate. The old wrapper parity script has been removed.

## Local Launch Path For Evaluation

### Runtime

Expected env source:

- `apps/api/.env.local`
- or exported shell env vars

Minimum env:

- `LINEAR_API_KEY`
- optional overrides:
  - `PORT`
  - `WORKFLOW_PATH`
  - `SYMPHONY_DB_FILE`
  - `SYMPHONY_SOURCE_REPO`

Start command:

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

**Backend parity is strong enough to proceed with UI work.**

### Remaining Before Declaring The Migration Finished

The remaining work is no longer “make the runtime real.” It is:

1. Keep the parity evidence command green while refactors land.
2. Continue Elixir-to-TypeScript audit sweeps for regressions and edge cases.
3. Finish module-boundary cleanup on the remaining oversized files.
4. Build the frontend against the now-stable API and observability contracts.

Until the UI and final cleanup pass are complete, keep using the Elixir codebase as the oracle for
behavioral comparisons. The backend itself is no longer blocked on stubbed runtime seams.
