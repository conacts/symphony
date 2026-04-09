# Symphony

Symphony is a single-host control plane for Linear-driven coding-agent orchestration.

This directory holds the durable product spec and templates. The live runtime implementation remains
under `apps/` and `packages/`.

## Canonical Docs

- product shape: [`SPEC.md`](SPEC.md)
- repo contract authoring: [`../packages/runtime-contract/README.md`](../packages/runtime-contract/README.md)
- operator/runtime setup: [`../docs/architecture/symphony-runtime-operations.md`](../docs/architecture/symphony-runtime-operations.md)
- accepted decisions: [`../docs/adr`](../docs/adr)
- docs index: [`../docs/README.md`](../docs/README.md)

## Repository Notes

The `symphony/` directory is intentionally not part of the pnpm/turbo workspace graph. The live
runtime code lives under `apps/` and `packages/`.

This copy was imported from [openai/symphony](https://github.com/openai/symphony) and adapted to
this extracted-repo layout. The nested `symphony/.git` repository was removed on purpose so the
parent repository owns review, history, and release flow after import.
