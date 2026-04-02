# Symphony

Symphony turns project work into isolated, autonomous implementation runs so operators can manage
work instead of supervising coding agents turn by turn.

> [!WARNING]
> Symphony is still an engineering preview intended for trusted environments.

## Repo Layout

This extracted repo keeps the TypeScript control plane and the Elixir oracle side by side:

- `symphony/` holds the imported Symphony source, spec, and implementation docs
- `symphony/elixir/` holds the current runtime oracle
- `../WORKFLOW.md` is the repo-owned orchestration contract
- `../scripts/symphony/run-local.sh` launches the Elixir oracle
- `../scripts/symphony/run-typescript-local.sh` launches the TypeScript runtime

The `symphony/` directory is intentionally not part of the pnpm/turbo workspace graph. The
workspace packages live under `apps/` and `packages/`.

## Ownership And Sync

This copy was imported from [openai/symphony](https://github.com/openai/symphony) and then adapted
to this extracted repo layout.

The nested `symphony/.git` repository was removed on purpose so the parent repo owns review,
history, and release flow after import.

When refreshing Symphony:

1. Pull or inspect upstream changes in a separate checkout.
2. Import only the changes this repo wants into `symphony/`.
3. Update this README plus any runbooks that change with the runtime contract.

## Running Symphony

For the repo-owned Elixir evaluation flow, start with [`elixir/README.md`](elixir/README.md) and
`../scripts/symphony/run-local.sh`.

For the TypeScript control-plane evaluation path and the explicit “not ready yet” cutover
checklist, see `../docs/architecture/symphony-typescript-parity-readiness.md`.

For the supported Docker-first local developer path, see
`../docs/docker-workspace-local-development.md`.

### Requirements

Symphony works best in codebases that have adopted
[harness engineering](https://openai.com/index/harness-engineering/). Symphony is the next step:
moving from managing coding agents to managing the work that needs to get done.

### Option 1. Make your own

Tell your preferred coding agent to build Symphony according to the spec in `symphony/SPEC.md`.

### Option 2. Use the reference implementation

Check out [elixir/README.md](elixir/README.md) for instructions on how to set up your environment
and run the Elixir-based Symphony implementation. You can also ask your preferred coding agent to
help with the setup:

> Set up Symphony for this repository based on `symphony/elixir/README.md` and the repo-owned
> launcher at `./scripts/symphony/run-local.sh`.
