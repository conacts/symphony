import { describe, expect, it } from "vitest";
import {
  buildSymphonyRuntimePostgresConnectionString,
  resolveSymphonyRuntimeEnvBundle,
  resolveSymphonyRuntimeHostEnv,
  normalizeSymphonyRuntimeManifest
} from "./runtime-manifest.js";

describe("runtime manifest env resolution", () => {
  it("resolves required host env plus static, runtime, and service bindings explicitly", () => {
    const manifest = normalizeSymphonyRuntimeManifest({
      schemaVersion: 1,
      workspace: {
        packageManager: "pnpm"
      },
      services: {
        postgres: {
          type: "postgres",
          image: "postgres:16",
          hostname: "db",
          port: 5433,
          database: "app",
          username: "app",
          password: "secret"
        }
      },
      env: {
        host: {
          required: ["GITHUB_TOKEN"],
          optional: ["MISSING_OPTIONAL"]
        },
        inject: {
          STATIC_VALUE: {
            kind: "static",
            value: "literal"
          },
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
          SYMPHONY_WORKSPACE_KEY: {
            kind: "runtime",
            value: "workspaceKey"
          }
        }
      },
      lifecycle: {
        bootstrap: [],
        migrate: [],
        verify: [
          {
            name: "verify",
            run: "pnpm test"
          }
        ],
        seed: [],
        cleanup: []
      }
    });

    const resolved = resolveSymphonyRuntimeEnvBundle({
      manifest,
      environmentSource: {
        GITHUB_TOKEN: "github-token"
      },
      runtime: {
        issueId: "issue-123",
        issueIdentifier: "COL-123",
        runId: "run-123",
        workspaceKey: "COL-123",
        workspacePath: "/home/agent/workspace",
        backendKind: "docker"
      },
      services: {
        postgres: {
          type: "postgres",
          serviceKey: "postgres",
          host: "db",
          port: 5433,
          database: "app",
          username: "app",
          password: "secret",
          connectionString: buildSymphonyRuntimePostgresConnectionString({
            host: "db",
            port: 5433,
            database: "app",
            username: "app",
            password: "secret"
          })
        }
      }
    });

    expect(resolved.values).toEqual({
      GITHUB_TOKEN: "github-token",
      STATIC_VALUE: "literal",
      DATABASE_URL: "postgresql://app:secret@db:5433/app",
      PGHOST: "db",
      SYMPHONY_WORKSPACE_KEY: "COL-123"
    });
    expect(resolved.summary).toEqual({
      source: "manifest",
      injectedKeys: [
        "DATABASE_URL",
        "GITHUB_TOKEN",
        "PGHOST",
        "STATIC_VALUE",
        "SYMPHONY_WORKSPACE_KEY"
      ],
      requiredHostKeys: ["GITHUB_TOKEN"],
      optionalHostKeys: [],
      staticBindingKeys: ["STATIC_VALUE"],
      runtimeBindingKeys: ["SYMPHONY_WORKSPACE_KEY"],
      serviceBindingKeys: ["DATABASE_URL", "PGHOST"]
    });
  });

  it("fails fast with a path-targeted error when required host env is missing", () => {
    const manifest = normalizeSymphonyRuntimeManifest({
      schemaVersion: 1,
      workspace: {
        packageManager: "pnpm"
      },
      env: {
        host: {
          required: ["OPENAI_API_KEY"],
          optional: []
        },
        inject: {}
      },
      lifecycle: {
        bootstrap: [],
        migrate: [],
        verify: [
          {
            name: "verify",
            run: "pnpm test"
          }
        ],
        seed: [],
        cleanup: []
      }
    });

    expect(() =>
      resolveSymphonyRuntimeHostEnv({
        manifest,
        environmentSource: {},
        manifestPath: "/repo/.symphony/runtime.ts"
      })
    ).toThrowError(
      /env\.host\.required\[0\]: Required host environment variable OPENAI_API_KEY is missing/i
    );
  });

  it("fails fast when a declared service binding cannot be resolved", () => {
    const manifest = normalizeSymphonyRuntimeManifest({
      schemaVersion: 1,
      workspace: {
        packageManager: "pnpm"
      },
      services: {
        postgres: {
          type: "postgres",
          image: "postgres:16",
          database: "app",
          username: "app",
          password: "secret"
        }
      },
      env: {
        host: {
          required: [],
          optional: []
        },
        inject: {
          DATABASE_URL: {
            kind: "service",
            service: "postgres",
            value: "connectionString"
          }
        }
      },
      lifecycle: {
        bootstrap: [],
        migrate: [],
        verify: [
          {
            name: "verify",
            run: "pnpm test"
          }
        ],
        seed: [],
        cleanup: []
      }
    });

    expect(() =>
      resolveSymphonyRuntimeEnvBundle({
        manifest,
        environmentSource: {},
        runtime: {
          issueId: "issue-123",
          issueIdentifier: "COL-123",
          runId: "run-123",
          workspaceKey: "COL-123",
          workspacePath: "/home/agent/workspace",
          backendKind: "docker"
        }
      })
    ).toThrowError(
      /env\.inject\.DATABASE_URL: Service binding postgres\.connectionString could not be resolved/i
    );
  });

  it("fails fast when a runtime binding resolves to null", () => {
    const manifest = normalizeSymphonyRuntimeManifest({
      schemaVersion: 1,
      workspace: {
        packageManager: "pnpm"
      },
      env: {
        host: {
          required: [],
          optional: []
        },
        inject: {
          SYMPHONY_RUN_ID: {
            kind: "runtime",
            value: "runId"
          }
        }
      },
      lifecycle: {
        bootstrap: [],
        migrate: [],
        verify: [
          {
            name: "verify",
            run: "pnpm test"
          }
        ],
        seed: [],
        cleanup: []
      }
    });

    expect(() =>
      resolveSymphonyRuntimeEnvBundle({
        manifest,
        environmentSource: {},
        runtime: {
          issueId: "issue-123",
          issueIdentifier: "COL-123",
          runId: null,
          workspaceKey: "COL-123",
          workspacePath: "/home/agent/workspace",
          backendKind: "docker"
        },
        manifestPath: "/repo/.symphony/runtime.ts"
      })
    ).toThrowError(
      /env\.inject\.SYMPHONY_RUN_ID: Runtime binding runId is unavailable/i
    );
  });
});
