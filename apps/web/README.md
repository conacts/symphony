# @symphony/web

Next.js App Router dashboard boundary for the Symphony developer control plane.

## Owns

- App Router layout, navigation, and internal control-plane shell composition.
- Dashboard-boundary env loading and runtime endpoint catalog composition.
- Symphony-specific presentation over `@symphony/contracts`.

## Does not own

- Reusable orchestration logic.
- Shared transport schemas.
- Primitive UI package ownership.
- Legacy business-domain logic from the old host repo.

This app currently carries only local App Router concerns so the shadcn CLI can install cleanly. Shared primitive extraction can happen after the local dashboard foundation is stable.

## Local Evaluation

Run the dashboard with:

```bash
pnpm --filter @symphony/web dev
```

Minimum env:

- `NEXT_PUBLIC_SYMPHONY_RUNTIME_BASE_URL=http://127.0.0.1:4400`

The dashboard currently covers:

- runtime summary
- issue, run, and problem-run forensics
- refresh now
- requeue affordances that point back to GitHub `/rework` and Linear

The dashboard is downstream of the core orchestration work. It is useful for observability, but it
is not part of the critical path for the repo-contract and Docker-runtime replacement cut.
