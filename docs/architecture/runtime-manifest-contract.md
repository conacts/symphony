# Runtime Manifest Contract

Date: 2026-04-01

## Goal

Define and operationalize the live repo-local runtime manifest surface for Symphony's Docker-only
execution contract.

This contract covers:

- a strict repo-local authoring location: `.symphony/runtime.ts`
- an explicit authoring/export surface: `@symphony/runtime-contract`
- `defineSymphonyRuntime(...)`
- strict manifest loading and validation
- readable path-targeted validation errors
- startup-time validation of required host env presence
- explicit env bundle resolution from `env.host` and `env.inject`
- per-workspace Docker network provisioning
- per-workspace Postgres sidecar provisioning for manifest-declared services
- Postgres readiness checks plus optional Postgres `init` steps
- explicit env bundle injection into workspace hooks and Codex runtime launch paths
- ordered manifest lifecycle execution for `bootstrap`, `migrate`, optional `seed`, and
  required `verify` inside Docker-backed workspaces
- explicit warm-reuse skip semantics and teardown-time manifest `cleanup`
- lifecycle phase/step observability without surfacing secret env values

This contract does not yet cover:

- shared Postgres instances across workspaces
- host port publishing for sidecars

## Authoring

Repo-local manifests live at `.symphony/runtime.ts` and must default export the result of
`defineSymphonyRuntime(...)`.

```ts
import { defineSymphonyRuntime } from "@symphony/runtime-contract";

export default defineSymphonyRuntime({
  schemaVersion: 1,

  workspace: {
    packageManager: "pnpm",
    workingDirectory: "."
  },

  services: {
    postgres: {
      type: "postgres",
      image: "postgres:16",
      database: "app",
      username: "app",
      password: "app",
      resources: {
        memoryMb: 512,
        cpuShares: 512
      },
      readiness: {
        timeoutMs: 15_000,
        intervalMs: 500,
        retries: 20
      },
      init: [
        {
          name: "extensions",
          run: "psql \"$DATABASE_URL\" -c 'select 1'",
          timeoutMs: 15_000
        }
      ]
    }
  },

  env: {
    host: {
      required: ["OPENAI_API_KEY"],
      optional: ["GITHUB_TOKEN"]
    },
    inject: {
      DATABASE_URL: {
        kind: "service",
        service: "postgres",
        value: "connectionString"
      },
      PGHOST: {
        kind: "service",
        service: "postgres",
        value: "host"
      },
      PGPORT: {
        kind: "service",
        service: "postgres",
        value: "port"
      },
      PGDATABASE: {
        kind: "service",
        service: "postgres",
        value: "database"
      },
      PGUSER: {
        kind: "service",
        service: "postgres",
        value: "username"
      },
      PGPASSWORD: {
        kind: "service",
        service: "postgres",
        value: "password"
      },
      SYMPHONY_ISSUE_IDENTIFIER: {
        kind: "runtime",
        value: "issueIdentifier"
      },
      SYMPHONY_WORKSPACE_KEY: {
        kind: "runtime",
        value: "workspaceKey"
      }
    }
  },

  lifecycle: {
    bootstrap: [
      {
        name: "bootstrap",
        run: "pnpm bootstrap",
        timeoutMs: 300_000
      }
    ],
    migrate: [
      {
        name: "migrate",
        run: "pnpm db:migrate",
        timeoutMs: 120_000
      }
    ],
    verify: [
      {
        name: "smoke",
        run: "pnpm test:smoke",
        timeoutMs: 120_000
      }
    ],
    seed: [],
    cleanup: []
  }
});
```

## Frozen V1 Shape

Top level:

- `schemaVersion: 1`
- `workspace`
- `services?`
- `env`
- `lifecycle`

`workspace`:

- `packageManager: "pnpm" | "npm" | "yarn" | "bun"` is required
- `workingDirectory?: string`
- `workingDirectory` defaults to `.`
- `workingDirectory` must be workspace-relative and must not escape the repo root

`services`:

- keyed object; the key is the stable service key
- in v1 only `type: "postgres"` is supported
- the service key is the stable service identity
- `hostname?: string` defaults to the service key
- hostnames must be unique across services
- postgres service fields:
  - `type: "postgres"`
  - `image: string`
  - `hostname?: string`
  - `port?: number` default `5432`
  - `database: string`
  - `username: string`
  - `password: string`
  - `resources?: { memoryMb?: number; cpuShares?: number }`
    - when omitted, Symphony does not pass Docker CPU or memory resource flags for the service
  - `readiness?: { timeoutMs?: number; intervalMs?: number; retries?: number }`
  - `init?: Step[]`

`env`:

- `host.required: string[]`
- `host.optional: string[]`
- `inject: Record<string, Binding>`

Inject binding kinds:

- `static`
  - `{ kind: "static", value: string }`
- `service`
  - `{ kind: "service", service: string, value: "connectionString" | "host" | "port" | "database" | "username" | "password" }`
- `runtime`
  - `{ kind: "runtime", value: "issueId" | "issueIdentifier" | "runId" | "workspaceKey" | "workspacePath" | "backendKind" }`

`lifecycle`:

- `bootstrap: Step[]` required
- `migrate: Step[]` required
- `verify: Step[]` required and non-empty
- `seed?: Step[]`
- `cleanup?: Step[]`

`Step`:

- `{ name: string, run: string, cwd?: string, timeoutMs?: number }`
- `cwd` must be workspace-relative and must stay within the repo root

## Docker Lifecycle Semantics

For Docker-backed workspaces with a valid manifest, Symphony executes manifest lifecycle phases in
this order during prepare:

1. `bootstrap`
2. `migrate`
3. optional `seed`
4. `verify`

`verify` is required and must succeed before the workspace is considered ready.

Execution semantics:

- before `bootstrap`, Symphony uses `workspace.packageManager` to ensure repo dependencies are
  installed unless the manifest already makes dependency install an explicit bootstrap step
- each phase is an ordered array of steps
- steps run inside the prepared workspace container with the resolved env bundle
- step cwd resolves from `workspace.workingDirectory`, overridden by step `cwd`
- step execution stops on the first non-zero exit code
- later phases do not run after a failure

Warm reuse semantics are explicit and cache-backed:

- `bootstrap` runs once per warm workspace filesystem lifetime
- `migrate` runs once per warm service lifetime
- `seed` runs once per warm service lifetime
- `verify` runs once per ready lifetime
  ready lifetime = workspace lifetime + service lifetime + workspace container identity
- fully reused warm workspaces skip all setup phases
- if prepare fails mid-lifecycle, already-completed phases stay cached and the failed phase reruns
  on the next prepare attempt
- if the service side is recreated, `migrate`, `seed`, and `verify` rerun while `bootstrap`
  remains cached

When no manifest services are declared, `migrate` and `seed` fall back to the workspace lifetime
so they still run once per warm workspace when configured.

Teardown semantics:

- `cleanup` runs during teardown before service, network, and workspace removal
- `cleanup` is best effort, matching existing `before_remove` semantics
- cleanup failure is surfaced explicitly in lifecycle events and cleanup metadata, but resource
  removal still continues so teardown does not silently leak managed resources

## Env Resolution Model

Manifest env resolution is explicit.

`env.host`:

- `host.required` keys are read directly from the runtime environment source
- missing required keys fail fast with readable, path-targeted errors such as
  `env.host.required[0]`
- `host.optional` keys are included only when present

`env.inject`:

- `static` injects the literal manifest value
- `runtime` injects bounded runtime context:
  `issueId`, `issueIdentifier`, `runId`, `workspaceKey`, `workspacePath`,
  `backendKind`
- `service` injects values from actual provisioned service metadata, not placeholders

The resolved env bundle becomes the primary model passed into:

- workspace lifecycle execution
- runtime launch paths
- Postgres `init` steps

The bundle is surfaced with a bounded summary only:

- source
- injected key names
- required and optional host key names that were resolved
- binding-key buckets for `static`, `runtime`, and `service`

Secret values are never logged in manifest env summaries or Docker command error surfaces.

## Startup Validation

Startup validation now does two bounded checks for repos that define `.symphony/runtime.ts`:

1. load and validate the manifest shape
2. resolve `env.host.required` and `env.host.optional` against the runtime environment source

That means a repo with a valid manifest but missing required host env fails startup early and
readably, before any workspace or runtime work begins.

## Docker Service Provisioning Model

For Docker-backed workspaces with a valid manifest:

- one deterministic Docker network is created per workspace
- one deterministic Postgres sidecar is created per workspace service key
- the workspace container and sidecar share the same network
- sidecars are reachable by stable hostname alias inside that network
- sidecars never publish ports to the host
- sidecars use manifest resource limits when provided
- sidecars fall back to conservative defaults of `512 MB` memory and `512` CPU shares when the
  manifest omits them
- readiness must succeed before optional service `init` steps run
- resources stay warm across retries while the workspace stays alive
- teardown removes both the sidecar and the workspace network

## Loader

The explicit subpath is `@symphony/runtime-contract`.

It exposes:

- `defineSymphonyRuntime(...)` for repo-local authoring
- `loadSymphonyRuntimeManifest(...)` for bounded manifest loading
- `resolveSymphonyRuntimeHostEnv(...)` for startup validation and required-host-env checks
- `resolveSymphonyRuntimeEnvBundle(...)` for explicit env bundle resolution
- manifest types and validation helpers for tests and internal composition

Loader rules for `.symphony/runtime.ts`:

1. Load exactly one explicit entry file: `.symphony/runtime.ts`.
2. Support TypeScript source directly. The target repo does not need to be built first.
3. Bundle only that manifest entry and its relative file graph with `esbuild`.
4. Resolve `@symphony/runtime-contract` through one explicit alias to a local authoring shim
   that re-exports `defineSymphonyRuntime(...)`, in both source and built-package mode.
5. Leave other bare package imports external; they must resolve normally in the runtime
   environment through the target repo's installed `node_modules`.
6. Do not read or honor arbitrary target-repo `tsconfig` path aliases.
7. Do not provide a general-purpose module runner. This is a bounded manifest loader.

That tradeoff is intentional:

- repo manifests can import `defineSymphonyRuntime` from the frozen subpath even when the target
  repo is just source on disk
- relative TS helper imports next to `.symphony/runtime.ts` are supported
- hidden repo-specific transpilation behavior is intentionally excluded

## Validation

Validation fails closed and produces path-targeted errors.

The validator rejects:

- missing `.symphony/runtime.ts`
- modules that do not default export `defineSymphonyRuntime(...)`
- unknown top-level keys
- unknown nested keys in strict manifest objects
- `schemaVersion` values other than `1`
- invalid or missing `workspace.packageManager`
- invalid `workspace.workingDirectory`
- unsupported service types
- invalid service keys
- invalid service hostnames
- duplicate service hostnames
- invalid or missing required postgres service fields
- invalid env var names in `host.required`, `host.optional`, or `inject`
- duplicate host env entries
- overlap between `host.required` and `host.optional`
- malformed env binding objects
- invalid binding enum values
- service env bindings that reference unknown services
- malformed lifecycle phase arrays
- empty `lifecycle.verify`
- malformed lifecycle step entries
- lifecycle `cwd` paths that are absolute or escape the workspace root

## Runtime Wiring

`apps/api` validates the admitted repository manifest during startup when `sourceRepo` is
configured.

The Docker-backed runtime then uses the admitted manifest during workspace preparation to:

- resolve required host env
- resolve runtime and service env bindings
- provision declared services
- execute declared lifecycle phases

There is no supported parallel local-backend runtime path.
