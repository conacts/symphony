# Runtime Manifest Contract

Date: 2026-04-01

## Goal

Freeze the repo-local runtime manifest surface for Docker-first workspace orchestration without yet
switching runtime behavior over to manifest-driven execution.

This pass covers:

- a strict repo-local authoring location: `.symphony/runtime.ts`
- an explicit authoring/export surface: `@symphony/core/runtime-manifest`
- `defineSymphonyRuntime(...)`
- strict manifest loading and validation
- readable path-targeted validation errors

This pass does not yet cover:

- Postgres sidecar provisioning
- env bundle generation or injection
- manifest-driven bootstrap / migrate / verify / seed / cleanup execution
- replacing the current Docker backend env-based selection or launch behavior

## Authoring

Repo-local manifests live at `.symphony/runtime.ts` and must default export the result of
`defineSymphonyRuntime(...)`.

```ts
import { defineSymphonyRuntime } from "@symphony/core/runtime-manifest";

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
        name: "install",
        run: "corepack enable && pnpm install --frozen-lockfile",
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

## Loader

The explicit subpath is `@symphony/core/runtime-manifest`.

It exposes:

- `defineSymphonyRuntime(...)` for repo-local authoring
- `loadSymphonyRuntimeManifest(...)` for bounded manifest loading
- manifest types and validation helpers for tests and internal composition

Loader rules for `.symphony/runtime.ts`:

1. Load exactly one explicit entry file: `.symphony/runtime.ts`.
2. Support TypeScript source directly. The target repo does not need to be built first.
3. Bundle only that manifest entry and its relative file graph with `esbuild`.
4. Resolve `@symphony/core/runtime-manifest` through one explicit alias to a local authoring shim
   that re-exports `defineSymphonyRuntime(...)`.
5. Leave other bare package imports external; they must resolve normally in the runtime
   environment.
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

## Runtime Wiring In This Pass

`apps/api` now preflights `sourceRepo/.symphony/runtime.ts` during startup when `sourceRepo` is
configured. That load is validation-only in this pass:

- success: runtime startup continues unchanged
- failure: startup fails before app service composition continues

The current Docker backend still reads runtime selection from existing env config. The manifest is
loaded and frozen now so later passes can move sidecars, env wiring, and lifecycle execution onto
the repo-local contract without changing the contract shape again.
