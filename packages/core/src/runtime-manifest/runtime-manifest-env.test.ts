import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSymphonyRuntimePostgresConnectionString,
  resolveSymphonyRuntimeEnvBundle,
  resolveSymphonyRuntimeHostEnv,
  normalizeSymphonyRuntimeManifest
} from "../runtime-manifest.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("runtime manifest env resolution", () => {
  it("resolves required host env plus static, runtime, and service bindings explicitly", async () => {
    const repoRoot = await createTempRepoRoot();
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
        repo: {
          path: ".coldets/local/resolved.env",
          required: ["QSTASH_TOKEN"],
          optional: ["QSTASH_URL"]
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
      repoRoot,
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
      QSTASH_TOKEN: "qstash-token",
      QSTASH_URL: "http://localhost:8080",
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
        "QSTASH_TOKEN",
        "QSTASH_URL",
        "STATIC_VALUE",
        "SYMPHONY_WORKSPACE_KEY"
      ],
      requiredHostKeys: ["GITHUB_TOKEN"],
      optionalHostKeys: [],
      repoEnvPath: path.join(repoRoot, ".coldets", "local", "resolved.env"),
      projectedRepoKeys: ["QSTASH_TOKEN", "QSTASH_URL"],
      requiredRepoKeys: ["QSTASH_TOKEN"],
      optionalRepoKeys: ["QSTASH_URL"],
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

  it("fails fast when the declared repo runtime bundle is missing", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "symphony-runtime-env-missing-"));
    tempDirectories.push(repoRoot);
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
        repo: {
          path: ".coldets/local/resolved.env",
          required: ["QSTASH_TOKEN"],
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
      resolveSymphonyRuntimeEnvBundle({
        manifest,
        repoRoot,
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
    ).toThrowError(/env\.repo\.path: Required repo runtime env snapshot is unavailable/i);
  });
});

async function createTempRepoRoot(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), "symphony-runtime-env-")
  );
  tempDirectories.push(repoRoot);
  await writeResolvedEnvFile(repoRoot);
  return repoRoot;
}

async function writeResolvedEnvFile(repoRoot: string): Promise<void> {
  await mkdir(path.join(repoRoot, ".coldets", "local"), {
    recursive: true
  });
  await writeFile(
    path.join(repoRoot, ".coldets", "local", "resolved.env"),
    "QSTASH_TOKEN=qstash-token\nQSTASH_URL=http://localhost:8080\n",
    {
      encoding: "utf8",
      flag: "w"
    }
  );
}
