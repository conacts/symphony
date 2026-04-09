# @symphony/runtime-contract

`@symphony/runtime-contract` owns the live repo authoring surface for admitted Symphony repositories.

If a repository needs to be valid for Symphony, this package is the contract boundary.

## Owns

- `.symphony/runtime.ts`
- `.symphony/prompt.md`
- manifest loading, normalization, and validation
- prompt loading, render validation, and mock payload generation
- repo-level contract loading through `loadSymphonyRuntimeContract(...)`

## Required Repo Files

Every admitted repository must provide exactly these files:

- `.symphony/runtime.ts`
- `.symphony/prompt.md`

The runtime manifest is authored through `defineSymphonyRuntime(...)` from this package. The prompt
file is a static template that Symphony renders in memory for the current run.

## Runtime Manifest

The current live manifest surface is defined by [`src/runtime-manifest-contract.ts`](src/runtime-manifest-contract.ts)
and validated by [`src/runtime-manifest-validation.ts`](src/runtime-manifest-validation.ts).

Minimal example:

```ts
import { defineSymphonyRuntime } from "@symphony/runtime-contract";

export default defineSymphonyRuntime({
  schemaVersion: 1,
  repositoryKey: "conacts/symphony",
  linear: {
    teamKey: "SYM"
  },
  workspace: {
    packageManager: "pnpm",
    workingDirectory: "."
  },
  env: {
    host: {
      required: ["OPENAI_API_KEY"],
      optional: ["GITHUB_TOKEN"]
    },
    inject: {
      SYMPHONY_ISSUE_IDENTIFIER: {
        kind: "runtime",
        value: "issueIdentifier"
      }
    }
  },
  lifecycle: {
    bootstrap: [
      {
        name: "bootstrap",
        run: "pnpm bootstrap"
      }
    ],
    migrate: [
      {
        name: "migrate",
        run: "pnpm migrate"
      }
    ],
    verify: [
      {
        name: "verify",
        run: "pnpm verify"
      }
    ]
  }
});
```

Key rules:

- `repositoryKey` is required and must use `<owner>/<repo>`.
- `linear.teamKey` is required and is the default routing key for issues in that repo.
- `workspace.packageManager` is required.
- `env.host.required` and `env.host.optional` declare repo-owned env dependencies.
- `env.inject` is the only place for static, service, and runtime bindings.
- `lifecycle.verify` is required and must be non-empty.
- `services` and `pi` are optional, but if present they must match the live schema in code.

## Prompt Contract

The prompt contract lives at `.symphony/prompt.md`.

Rules:

- Symphony reads the file from the repo and renders it in memory.
- Missing variables, invalid syntax, or an empty rendered prompt are hard failures.
- The rendered prompt is captured for audit/forensics.
- Symphony does not write a generated prompt file back into the repository.

The prompt loader and renderer live in [`src/prompt-contract.ts`](src/prompt-contract.ts).

## Package Entry Points

These are the main helpers other packages should build around:

- `defineSymphonyRuntime(...)`
- `loadSymphonyRuntimeManifest(...)`
- `validateSymphonyRuntimeManifest(...)`
- `loadSymphonyPromptContract(...)`
- `validateSymphonyPromptContract(...)`
- `loadSymphonyRuntimeContract(...)`
- `buildMockSymphonyPromptContractPayload()`

## Change Discipline

If you need to change the live repo contract:

1. update the types and validation in `src/`
2. update the tests in `src/*.test.ts`
3. update this README if the authoring surface changed
4. add or update an ADR in [`../../docs/adr`](../../docs/adr) if the change is a durable platform decision
