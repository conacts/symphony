import { defineSymphonyRuntime } from "@symphony/runtime-contract";

export default defineSymphonyRuntime({
  schemaVersion: 1,
  workspace: {
    packageManager: "pnpm",
    workingDirectory: "."
  },
  env: {
    host: {
      required: [],
      optional: []
    },
    inject: {
      SYMPHONY_ISSUE_IDENTIFIER: {
        kind: "runtime",
        value: "issueIdentifier"
      },
      SYMPHONY_RUN_ID: {
        kind: "runtime",
        value: "runId"
      },
      SYMPHONY_WORKSPACE_KEY: {
        kind: "runtime",
        value: "workspaceKey"
      },
      SYMPHONY_WORKSPACE_PATH: {
        kind: "runtime",
        value: "workspacePath"
      }
    }
  },
  lifecycle: {
    bootstrap: [
      {
        name: "install",
        run: "pnpm install --frozen-lockfile",
        timeoutMs: 300_000
      }
    ],
    migrate: [],
    verify: [
      {
        name: "verify",
        run: "pnpm verify:runtime",
        timeoutMs: 300_000
      }
    ],
    seed: [],
    cleanup: []
  }
});
