# Symphony

Symphony is a single-host control plane for Linear-driven coding-agent orchestration.

This directory now exists to hold the product specification, durable templates, and architecture
notes that explain the platform shape. It does not carry a second runtime implementation.

## Active Product Shape

- Docker-only issue execution
- admitted repo contract: `.symphony/runtime.ts` plus `.symphony/prompt.md`
- one runtime process can admit multiple repositories
- `repositoryKey` in `.symphony/runtime.ts` is the canonical repo identity
- each repo manifest also declares its Linear binding and Linear auth env key
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
pnpm dev:host
```

`pnpm dev:host` reads the local Symphony env file, keeps the SQLite file at `./symphony.db`, and
points the dashboard at the local API on `http://127.0.0.1:4400`. That avoids stale shell state
accidentally booting Symphony against some other admitted repository. It also checks required env
up front and refreshes the local workspace-runner image with normal Docker layer caching before
startup.

## Repo Routing

Symphony now uses a simple repo-routing convention:

- every admitted repo must declare `repositoryKey` in `.symphony/runtime.ts`
- `repositoryKey` must use `<owner>/<repo>` format, for example `conacts/symphony`
- every admitted repo must declare its Linear binding in `.symphony/runtime.ts`
- if a repo uses a dedicated Linear token, its manifest should name the env key via `linear.apiKeyEnvKey`
- the runtime admits one or more repo roots from `SYMPHONY_SOURCE_REPOS`
- GitHub review webhooks route by `repository.full_name`
- issue dispatch resolves from the admitted repo's Linear binding first and uses
  `repo:<owner>/<repo>` only as an explicit override/validation label
- the repo picker shows the admitted repo key and its Linear scope in the header

That keeps repo separation explicit without adding project-level tenancy or extra control-plane
concepts, while still allowing repo-scoped Linear auth.

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
