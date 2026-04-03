# Symphony Integration Prompt

Use this prompt when integrating a repository into Symphony.

```text
You are integrating this repository into Symphony, a Docker-only sub-agent orchestration platform.

Your job is to make this repository conform exactly to Symphony's live repo contract. Do not invent
a richer contract surface, do not optimize for human-local workflows first, and do not introduce
repo-local contract helpers that compete with Symphony's authoring API.

The contract authority is Symphony, not this repository.

Required repo artifacts:
- `.symphony/runtime.ts`
- `.symphony/prompt.md`

Required runtime authoring API:
- `.symphony/runtime.ts` must default export `defineSymphonyRuntime(...)`
- import `defineSymphonyRuntime` from `@symphony/runtime-contract`
- do not use repo-local helpers such as `defineRuntimeContract(...)`
- do not mirror or depend on Symphony internal package layout

Required live manifest shape:
- `schemaVersion`
- `workspace`
- `services`
- `env.host.required`
- `env.host.optional`
- `env.inject`
- `lifecycle`

Important schema rules:
- do not export `env.repo`
- do not export `env.context`
- runtime context belongs in `env.inject` with `kind: "runtime"`
- service bindings belong in `env.inject` with `kind: "service"`
- required and optional repo env belong in `env.host`

Lifecycle rules:
- use stable repo commands
- `bootstrap` prepares the repo for work, installs dependencies, validates injected env needed at bootstrap time, and builds required artifacts when later lifecycle phases depend on them
- `bootstrap` must not fetch secrets, render prompts, start long-lived services, or write secret-bearing env files
- `bootstrap` should succeed without database access; DB-dependent setup belongs in `migrate`
- `migrate` applies deterministic repo-owned setup against declared services
- `verify` proves the environment is usable with one narrow, deterministic high-signal proof
- avoid full-CI semantics in `verify` unless the repo truly cannot be considered usable without them

Expected command surface:
- `pnpm bootstrap`
- `pnpm migrate`
- `pnpm verify`
- optional `pnpm runtime:doctor`

Prompt contract rules:
- `.symphony/prompt.md` is a static template only
- Symphony renders it in memory and snapshots the rendered prompt for observability
- do not treat `.symphony/prompt.md` as runtime config
- do not require Symphony to write a generated prompt file into the repo

Environment and secrets rules:
- Symphony injects runtime inputs through process env
- do not require generated secret-bearing files under `.symphony/`
- lifecycle commands must not depend on dotenv or repo-written env files on Symphony contract paths
- human-local convenience wrappers are allowed only if they remain outside the required Symphony lifecycle contract

State semantics:
- platform-owned pre-agent refusal/setup/render failures map to `Failed`
- platform/provider interruptions map to `Paused`
- agent/repo-owned stops after work has begun map to `Blocked`
- `Bootstrapping` is platform-owned and happens before the first real agent turn
- `Blocked` is non-terminal and non-dispatch
- `Paused` is non-terminal and non-dispatch
- `Done` and `Canceled` are terminal
- `Approved` is active only for merge execution
- there are no hidden retries

Execution model:
- Docker-only
- one Linear issue is the canonical execution unit
- one issue may have only one active run across the system
- one issue workspace persists across runs by default
- PRs are artifacts of the issue, not the canonical execution unit

What not to build:
- local/worktree orchestration assumptions
- `WORKFLOW.md` as part of the required contract
- `.coldets/*` as part of the required contract
- repo-local contract constructors or helper packages that redefine the contract edge
- richer manifest buckets that Symphony does not currently accept

Implementation goal:
- make this repo wire-compatible with Symphony's live contract
- preserve any useful repo-local DX improvements only behind repo-local helpers, not in the exported manifest
- keep the visible repo contract tiny, explicit, and strict

Deliverables:
1. a conforming `.symphony/runtime.ts`
2. a conforming `.symphony/prompt.md`
3. stable lifecycle commands wired to the live contract
4. any optional helpers clearly documented as repo-local convenience, not contract
5. verification that Symphony's live manifest loader accepts the repo
```
