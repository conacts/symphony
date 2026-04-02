import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeSymphonyRuntimeManifestSchemaCompatibility,
  defaultSymphonyRuntimePostgresPort,
  defaultSymphonyRuntimeWorkingDirectory,
  loadSymphonyRuntimeManifest,
  normalizeSymphonyRuntimeManifest,
  SymphonyRuntimeManifestError,
  type SymphonyRuntimeManifestInput
} from "./runtime-manifest.js";

const tempDirectories: string[] = [];
const require = createRequire(import.meta.url);

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

describe("runtime manifest", () => {
  it("loads a valid repo-local TypeScript manifest through the explicit loader", async () => {
    const repoRoot = await createTempRepo();
    const manifestDirectory = path.join(repoRoot, ".symphony");

    await mkdir(manifestDirectory, {
      recursive: true
    });
    await writeFile(
      path.join(manifestDirectory, "steps.ts"),
      `export function buildStep(name: string, run: string) {
  return {
    name,
    run
  };
}
`
    );
    await writeFile(
      path.join(manifestDirectory, "runtime.ts"),
      `import { defineSymphonyRuntime } from "@symphony/runtime-contract";
import { buildStep } from "./steps.ts";

export default defineSymphonyRuntime({
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
      password: "app",
      resources: {
        memoryMb: 512,
        cpuShares: 512
      },
      readiness: {
        timeoutMs: 15000,
        intervalMs: 500,
        retries: 20
      },
      init: [
        buildStep("extensions", "psql \\"$DATABASE_URL\\" -c 'select 1'")
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
      SYMPHONY_ISSUE_IDENTIFIER: {
        kind: "runtime",
        value: "issueIdentifier"
      }
    }
  },
  lifecycle: {
    bootstrap: [],
    migrate: [],
    verify: [buildStep("smoke", "pnpm test:smoke")],
    seed: [buildStep("seed", "pnpm seed")],
    cleanup: []
  }
});
`
    );

    const loaded = await loadSymphonyRuntimeManifest({
      repoRoot
    });

    expect(loaded.repoRoot).toBe(repoRoot);
    expect(loaded.manifestPath).toBe(path.join(repoRoot, ".symphony", "runtime.ts"));
    expect(loaded.manifest.workspace).toEqual({
      packageManager: "pnpm",
      workingDirectory: defaultSymphonyRuntimeWorkingDirectory
    });
    expect(loaded.manifest.services.postgres).toEqual({
      type: "postgres",
      image: "postgres:16",
      hostname: "postgres",
      port: defaultSymphonyRuntimePostgresPort,
      database: "app",
      username: "app",
      password: "app",
      resources: {
        memoryMb: 512,
        cpuShares: 512
      },
      readiness: {
        timeoutMs: 15000,
        intervalMs: 500,
        retries: 20
      },
      init: [
        {
          name: "extensions",
          run: "psql \"$DATABASE_URL\" -c 'select 1'"
        }
      ]
    });
    expect(loaded.manifest.env.inject.DATABASE_URL).toEqual({
      kind: "service",
      service: "postgres",
      value: "connectionString"
    });
    expect(loaded.manifest.lifecycle.verify).toEqual([
      {
        name: "smoke",
        run: "pnpm test:smoke"
      }
    ]);
    expect(loaded.manifest.lifecycle.seed).toEqual([
      {
        name: "seed",
        run: "pnpm seed"
      }
    ]);
    expect(loaded.manifest.lifecycle.cleanup).toEqual([]);
  });

  it("loads bare package imports from the target repo runtime environment", async () => {
    const repoRoot = await createTempRepo();
    const nodeModulesDirectory = path.join(repoRoot, "node_modules");
    const yamlPackageRoot = path.dirname(require.resolve("yaml/package.json"));

    await mkdir(nodeModulesDirectory, {
      recursive: true
    });
    await symlink(yamlPackageRoot, path.join(nodeModulesDirectory, "yaml"), "junction");
    await writeRuntimeManifestSource(
      repoRoot,
      `import { defineSymphonyRuntime } from "@symphony/runtime-contract";
import YAML from "yaml";

const serialized = YAML.stringify({ ok: true }).trim();

export default defineSymphonyRuntime({
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
      EXAMPLE: {
        kind: "static",
        value: serialized
      }
    }
  },
  lifecycle: {
    bootstrap: [],
    migrate: [],
    verify: [
      {
        name: "smoke",
        run: "echo ok"
      }
    ]
  }
});
`
    );

    const loaded = await loadSymphonyRuntimeManifest({
      repoRoot
    });

    expect(loaded.manifest.env.inject.EXAMPLE).toEqual({
      kind: "static",
      value: "ok: true"
    });
  });

  it("fails fast when the repo-local manifest is missing", async () => {
    const repoRoot = await createTempRepo();

    await expect(
      loadSymphonyRuntimeManifest({
        repoRoot
      })
    ).rejects.toMatchObject({
      code: "missing_runtime_manifest"
    });
  });

  it("requires the manifest module to default export defineSymphonyRuntime(...)", async () => {
    const repoRoot = await createTempRepo();
    await writeRuntimeManifestSource(repoRoot, `export const manifest = {};`);

    await expect(
      loadSymphonyRuntimeManifest({
        repoRoot
      })
    ).rejects.toThrowError(/default export defineSymphonyRuntime/i);
  });

  it("fails with a readable loader error when the manifest source has a TypeScript syntax error", async () => {
    const repoRoot = await createTempRepo();
    await writeRuntimeManifestSource(
      repoRoot,
      `import { defineSymphonyRuntime } from "@symphony/runtime-contract";

export default defineSymphonyRuntime({
  schemaVersion: 1,
  workspace: {
    packageManager: "pnpm"
  },
  env: {
    host: {
      required: [],
      optional: []
    },
    inject: {}
  },
  lifecycle: {
    bootstrap: [],
    migrate: [],
    verify: [
      {
        name: "smoke",
        run: "pnpm test"
      }
    ]
  }
`
    );

    await expect(
      loadSymphonyRuntimeManifest({
        repoRoot
      })
    ).rejects.toMatchObject({
      code: "runtime_manifest_load_failed"
    });
    await expect(
      loadSymphonyRuntimeManifest({
        repoRoot
      })
    ).rejects.toThrowError(/Failed to load Symphony runtime manifest/i);
  });

  it("fails with a readable loader error when the manifest imports an unresolved module", async () => {
    const repoRoot = await createTempRepo();
    await writeRuntimeManifestSource(
      repoRoot,
      `import { defineSymphonyRuntime } from "@symphony/runtime-contract";
import { runtimeStep } from "./missing-helper.ts";

export default defineSymphonyRuntime({
  schemaVersion: 1,
  workspace: {
    packageManager: "pnpm"
  },
  env: {
    host: {
      required: [],
      optional: []
    },
    inject: {}
  },
  lifecycle: {
    bootstrap: [],
    migrate: [],
    verify: [runtimeStep("smoke", "pnpm test")]
  }
});
`
    );

    await expect(
      loadSymphonyRuntimeManifest({
        repoRoot
      })
    ).rejects.toMatchObject({
      code: "runtime_manifest_load_failed"
    });
    await expect(
      loadSymphonyRuntimeManifest({
        repoRoot
      })
    ).rejects.toThrowError(/missing-helper\.ts/i);
  });

  it("rejects unknown top-level keys", () => {
    expectManifestValidationError(
      () =>
        normalizeSymphonyRuntimeManifest({
          ...buildValidManifestInput(),
          unexpected: true
        }),
      /unexpected: Unknown key/i
    );
  });

  it("rejects unknown nested keys in strict manifest objects", () => {
    expectManifestValidationError(
      () =>
        normalizeSymphonyRuntimeManifest({
          ...buildValidManifestInput(),
          services: {
            postgres: {
              ...buildValidManifestInput().services!.postgres,
              resources: {
                memoryMb: 512,
                extra: true
              }
            }
          }
        }),
      /services\.postgres\.resources\.extra: Unknown key/i
    );
  });

  it("rejects unsupported service types", () => {
    const manifest = buildValidManifestInput();

    expectManifestValidationError(
      () =>
        normalizeSymphonyRuntimeManifest({
          ...manifest,
          services: {
            cache: {
              type: "redis",
              image: "redis:7",
              database: "app",
              username: "app",
              password: "app"
            }
          }
        }),
      /services\.cache\.type: Unsupported service type/i
    );
  });

  it("rejects unsupported schema versions explicitly", () => {
    expectManifestValidationError(
      () =>
        normalizeSymphonyRuntimeManifest({
          ...buildValidManifestInput(),
          schemaVersion: 2
        }),
      /schemaVersion: Unsupported schemaVersion 2\. Supported schema versions: 1\./i
    );

    expect(
      describeSymphonyRuntimeManifestSchemaCompatibility(2)
    ).toMatchObject({
      supported: false
    });
  });

  it("rejects repo env projection from the runtime contract surface", () => {
    expectManifestValidationError(
      () =>
        normalizeSymphonyRuntimeManifest({
          ...buildValidManifestInput(),
          env: {
            ...buildValidManifestInput().env,
            repo: {
              path: ".coldets/local/resolved.env",
              required: [],
              optional: []
            }
          }
        }),
      /env\.repo: Unknown key/i
    );
  });

  it("rejects invalid env bindings", () => {
    const manifest = buildValidManifestInput();

    expectManifestValidationError(
      () =>
        normalizeSymphonyRuntimeManifest({
          ...manifest,
          env: {
            host: {
              required: [],
              optional: []
            },
            inject: {
              DATABASE_URL: {
                kind: "service",
                service: "postgres",
                value: "url"
              }
            }
          }
        }),
      /env\.inject\.DATABASE_URL\.value: env\.inject\.DATABASE_URL\.value must be one of/i
    );
  });

  it("rejects empty verify lifecycle phases", () => {
    expectManifestValidationError(
      () =>
        normalizeSymphonyRuntimeManifest({
          ...buildValidManifestInput(),
          lifecycle: {
            ...buildValidManifestInput().lifecycle,
            verify: []
          }
        }),
      /lifecycle\.verify: lifecycle\.verify must contain at least one step/i
    );
  });

  it("rejects malformed lifecycle steps", () => {
    const manifest = buildValidManifestInput();

    expectManifestValidationError(
      () =>
        normalizeSymphonyRuntimeManifest({
          ...manifest,
          lifecycle: {
            ...manifest.lifecycle,
            verify: [
              {
                run: "pnpm test"
              }
            ]
          }
        }),
      /lifecycle\.verify\.0\.name: lifecycle\.verify\.0\.name must be a non-empty string/i
    );
  });
});

function buildValidManifestInput(): SymphonyRuntimeManifestInput {
  return {
    schemaVersion: 1,
    workspace: {
      packageManager: "pnpm",
      workingDirectory: "."
    },
    services: {
      postgres: {
        type: "postgres",
        image: "postgres:16",
        hostname: "postgres",
        port: 5_432,
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
        SYMPHONY_ISSUE_IDENTIFIER: {
          kind: "runtime",
          value: "issueIdentifier"
        }
      }
    },
    lifecycle: {
      bootstrap: [],
      migrate: [],
      verify: [
        {
          name: "smoke",
          run: "pnpm test:smoke"
        }
      ],
      seed: [
        {
          name: "seed",
          run: "pnpm seed"
        }
      ],
      cleanup: [
        {
          name: "cleanup",
          run: "pnpm cleanup"
        }
      ]
    }
  };
}

async function createTempRepo(): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "symphony-runtime-manifest-")
  );
  tempDirectories.push(directory);
  return directory;
}

async function writeRuntimeManifestSource(
  repoRoot: string,
  source: string
): Promise<void> {
  const manifestDirectory = path.join(repoRoot, ".symphony");

  await mkdir(manifestDirectory, {
    recursive: true
  });
  await writeFile(path.join(manifestDirectory, "runtime.ts"), source);
}

function expectManifestValidationError(
  action: () => unknown,
  pattern: RegExp
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(SymphonyRuntimeManifestError);
    expect((error as Error).message).toMatch(pattern);
    return;
  }

  throw new Error("Expected runtime manifest validation to fail.");
}
