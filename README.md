# Symphony

Symphony is a single-host control plane for Linear-driven coding-agent orchestration.

The durable product and contract docs live in a small set of canonical locations:

- product shape: [`symphony/SPEC.md`](symphony/SPEC.md)
- repo contract authoring: [`packages/runtime-contract/README.md`](packages/runtime-contract/README.md)
- operator/runtime setup: [`docs/architecture/symphony-runtime-operations.md`](docs/architecture/symphony-runtime-operations.md)
- accepted decisions: [`docs/adr/`](docs/adr/)
- docs index and category rules: [`docs/README.md`](docs/README.md)

## Local Self-Host

Use Symphony against this repository itself when validating orchestration changes locally:

```bash
pnpm install
pnpm docker:workspace-image:build
mkdir -p ~/.config/symphony
cp symphony.env.example ~/.config/symphony/symphony.env
pnpm dev:host
```

`pnpm dev:host` reads the local Symphony env file, keeps the SQLite file at `.symphony/runtime/symphony.db`,
forces `SYMPHONY_SOURCE_REPO` to this repository, clears inherited `SYMPHONY_SOURCE_REPOS`, and
points the dashboard at the local API on `http://127.0.0.1:4400`. That avoids stale shell state
accidentally booting Symphony against some other admitted repository. It also checks required env
up front and refreshes the local workspace-runner image with normal Docker layer caching before
startup.

`pnpm dev:self` remains as an alias.

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
