# Symphony

Symphony is a single-host control plane for Linear-driven coding-agent orchestration.

This directory now exists to hold the product specification, durable templates, and architecture
notes that explain the platform shape. It does not carry a second runtime implementation.

## Active Product Shape

- Docker-only issue execution
- one admitted repo contract: `.symphony/runtime.ts` plus `.symphony/prompt.md`
- one active run per Linear issue
- prompt rendering in memory from repo-owned template plus platform-provided variables
- fail-fast admission, dispatch, and startup behavior

## Where To Start

- product specification: [`SPEC.md`](SPEC.md)
- repo contract handoff: [`../docs/repo-integration-handoff.md`](../docs/repo-integration-handoff.md)
- runtime manifest details:
  [`../docs/architecture/runtime-manifest-contract.md`](../docs/architecture/runtime-manifest-contract.md)
- operator/runtime setup:
  [`../docs/architecture/symphony-runtime-operations.md`](../docs/architecture/symphony-runtime-operations.md)

## Repository Notes

The `symphony/` directory is intentionally not part of the pnpm/turbo workspace graph. The live
runtime code lives under `apps/` and `packages/`.

This copy was imported from [openai/symphony](https://github.com/openai/symphony) and adapted to
this extracted-repo layout. The nested `symphony/.git` repository was removed on purpose so the
parent repository owns review, history, and release flow after import.
