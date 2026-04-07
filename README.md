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

- product specification: [`SPEC.md`](symphony/SPEC.md)
- repo contract handoff: [`docs/repo-integration-handoff.md`](docs/repo-integration-handoff.md)
- runtime manifest details:
  [`docs/architecture/runtime-manifest-contract.md`](docs/architecture/runtime-manifest-contract.md)
- operator/runtime setup:
  [`docs/architecture/symphony-runtime-operations.md`](docs/architecture/symphony-runtime-operations.md)

## Local Self-Host

Use Symphony against this repository itself when validating orchestration changes locally:

```bash
pnpm install
pnpm docker:workspace-image:build
mkdir -p ~/.config/symphony
cp symphony.env.example ~/.config/symphony/symphony.env
pnpm dev:self
```

`pnpm dev:self` forces `SYMPHONY_SOURCE_REPO` to this repository root, keeps the SQLite file at
`./symphony.db`, and points the dashboard at the local API on `http://127.0.0.1:4400`. That avoids
stale shell state accidentally booting Symphony against some other admitted repository.

For a Linux Mint user service with hot reload:

```bash
mkdir -p ~/.config/systemd/user
cp symphony-dev.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now symphony-dev.service
```

## Repository Notes

The `symphony/` directory is intentionally not part of the pnpm/turbo workspace graph. The live
runtime code lives under `apps/` and `packages/`.

This copy was imported from [openai/symphony](https://github.com/openai/symphony) and adapted to
this extracted-repo layout. The nested `symphony/.git` repository was removed on purpose so the
parent repository owns review, history, and release flow after import.
