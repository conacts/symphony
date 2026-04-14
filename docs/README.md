# Documentation

Symphony keeps durable documentation in the smallest set of places that can stay accurate.

## Canonical Docs

- Product shape: [`../symphony/SPEC.md`](../symphony/SPEC.md)
- Intelligent-flow target truth: [`architecture/2026-04-14-intelligent-flow-golden-truth.md`](architecture/2026-04-14-intelligent-flow-golden-truth.md)
- Active Linear lifecycle: [`architecture/symphony-linear-ticket-lifecycle.md`](architecture/symphony-linear-ticket-lifecycle.md)
- Repo contract authoring: [`../packages/runtime-contract/README.md`](../packages/runtime-contract/README.md)
- Runtime/operator setup: [`architecture/symphony-runtime-operations.md`](architecture/symphony-runtime-operations.md)
- Accepted decisions: [`adr/`](adr/)
- Local Docker self-host setup: [`docker-workspace-local-development.md`](docker-workspace-local-development.md)

## Working Rules

- `docs/adr/` is for accepted decisions. If a document answers "why is this true?", it belongs there.
- `packages/*/README.md` is for live contract and package-boundary guidance. If the document describes a validated code surface, keep it next to that code.
- `docs/architecture/` is for operator or implementation notes that are still useful after the decision is made. It should not be a graveyard for stale plans.
- `docs/analysis/` is historical investigation material, not the source of truth.
- `docs/plans/` is working planning material, not the source of truth.
