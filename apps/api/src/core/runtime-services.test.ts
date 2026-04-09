import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTempSymphonySqliteHarness,
  renderSymphonyRuntimeManifestSource
} from "@symphony/test-support";
import {
  createSymphonyRuntimeAppServicesHarness,
  type SymphonyRuntimeAppServicesHarness
} from "../test-support/create-symphony-runtime-app-services-harness.js";
import { initializeSymphonyDb } from "@symphony/db";
import {
  applyRuntimeManifestPiPolicy,
  buildWorkspaceBackendPayload
} from "./runtime-services.js";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import { loadRuntimeServiceBootstrap } from "./runtime-service-bootstrap.js";
import { resolveDockerWorkspaceAuthContracts } from "./runtime-auth-contract.js";

const harnesses: SymphonyRuntimeAppServicesHarness[] = [];
const tempDirectories: string[] = [];
const runtimeServicesIntegrationTestTimeoutMs = 15_000;

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("runtime services", () => {
  it(
    "loads the default app services through the explicit prompt and runtime contract",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness({
        startPollScheduler: true,
        startMachineLoadMonitor: true
      });
      harnesses.push(harness);

      const { services, env } = harness;
      const refresh = await services.orchestrator.requestRefresh();

      expect(services.promptTemplate.promptTemplate).toBe("Prompt body\n");
      expect(services.promptContract.promptPath).toContain(".symphony/prompt.md");
      expect(services.runtimePolicy.tracker.kind).toBe("memory");
      expect(refresh).toEqual(
        expect.objectContaining({
          queued: true,
          coalesced: false,
          operations: ["poll", "reconcile"]
        })
      );
      expect(services.health.snapshot()).toEqual(
        expect.objectContaining({
          healthy: true,
          db: {
            file: env.dbFile,
            ready: true
          },
          machineLoad: expect.objectContaining({
            memoryPercent: expect.any(Number)
          } as never)
        } as never)
      );

      await waitFor(() => {
        const poller = services.health.snapshot().poller;
        return poller.lastCompletedAt !== null && poller.inFlight === false;
      });

      const runtimeLogs = await services.runtimeLogs.list();

      expect(runtimeLogs.logs.map((entry) => entry.eventType)).toEqual(
        expect.arrayContaining([
          "db_initialized",
          "tracker_placeholder_active",
          "workspace_backend_selected",
          "poller_started",
          "manual_refresh_queued",
          "poll_started",
          "poll_completed"
        ])
      );
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it("fails fast when the source repo runtime manifest is missing", async () => {
    const fixture = await createRuntimeBootstrapFixture({
      runtimeManifestSource: null
    });

    try {
      await expect(
        loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        })
      ).rejects.toThrowError(/Missing Symphony runtime manifest/i);
    } finally {
      await fixture.cleanup();
    }
  });

  it("fails fast when required host env from the runtime manifest is missing", async () => {
    const fixture = await createRuntimeBootstrapFixture({
      runtimeManifestSource: renderSymphonyRuntimeManifestSource(({
        schemaVersion: 1,
        repositoryKey: "openai/symphony",
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
      }) as never),
      environmentSource: {
        LINEAR_API_KEY: "test-linear-api-key"
      }
    });

    try {
      await expect(
        loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        })
      ).rejects.toThrowError(
        /Required host environment variable OPENAI_API_KEY is missing/i
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("detects when docker-backed runs do not have Pi auth or a provider api key", async () => {
    const fixture = await createRuntimeBootstrapFixture();

    try {
      const bootstrap = await loadRuntimeServiceBootstrap({
        env: fixture.env,
        environmentSource: fixture.environmentSource
      });
      const dockerAuth = resolveDockerWorkspaceAuthContracts({}, {
        preferredApiKeyEnvKey: bootstrap.harnessProviderEnvKey
      });

      expect(dockerAuth.pi.mount).toBeNull();
      expect(dockerAuth.pi.launchEnv).toEqual({});
    } finally {
      await fixture.cleanup();
    }
  });

  it(
    "accepts an OpenRouter api key for the Pi default profile",
    async () => {
      const fixture = await createRuntimeBootstrapFixture({
        environmentSource: {
          LINEAR_API_KEY: "test-linear-api-key",
          SYMPHONY_PI_PROFILE: "mimo-v2-pro"
        }
      });

      try {
        const bootstrap = await loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        });

        expect(bootstrap.runtimePolicy.agent.harness).toBe("pi");
        expect(bootstrap.runtimePolicy.agentRuntime.command).toBe("pi");
        expect(bootstrap.runtimePolicy.pi.profile).toBe("mimo-v2-pro");
        expect(bootstrap.runtimePolicy.pi.defaultModel).toBe(
          "xiaomi/mimo-v2-pro"
        );
        expect(bootstrap.runtimePolicy.pi.defaultReasoningEffort).toBe("high");
        expect(bootstrap.runtimePolicy.pi.provider).toEqual({
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        });
      } finally {
        await fixture.cleanup();
      }
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it(
    "loads runtime services with the Pi harness by default",
    async () => {
      const fixture = await createRuntimeBootstrapFixture({
        environmentSource: {
          SYMPHONY_PI_PROFILE: "mimo-v2-pro"
        }
      });

      try {
        const bootstrap = await loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        });

        expect(bootstrap.runtimePolicy.agent.harness).toBe("pi");
        expect(bootstrap.runtimePolicy.agentRuntime.command).toBe("pi");
        expect(bootstrap.runtimePolicy.agentRuntime.readTimeoutMs).toBe(120_000);
        expect(bootstrap.runtimePolicy.pi.profile).toBe("mimo-v2-pro");
        expect(bootstrap.runtimePolicy.pi.defaultModel).toBe(
          "xiaomi/mimo-v2-pro"
        );
        expect(bootstrap.runtimePolicy.pi.provider).toEqual({
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        });
      } finally {
        await fixture.cleanup();
      }
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it(
    "selects the admitted repo matching the process Linear scope when multiple repos are admitted",
    async () => {
      const fixture = await createMultiRepoRuntimeBootstrapFixture();

      try {
        const bootstrap = await loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        });
        const runtimeManifest = bootstrap.selectedRuntimeManifestEntry?.runtimeManifest.manifest;

        expect(
          bootstrap.admittedRepositories.map((repository) => repository.repositoryKey)
        ).toEqual(["conacts/symphony", "conacts/coldets-v2"]);
        expect(bootstrap.promptContract.promptPath).toBe(fixture.expectedPromptPath);
        expect(bootstrap.promptTemplate.promptTemplate).toBe("Coldets prompt\n");
        expect(runtimeManifest).not.toBeNull();

        const mergedPolicy = applyRuntimeManifestPiPolicy(
          bootstrap.runtimePolicy,
          runtimeManifest!
        );

        expect(mergedPolicy.pi.defaultPreset).toBe("premium");
        expect(mergedPolicy.pi.presets.premium).toEqual({
          model: "gpt-5.4",
          reasoningEffort: "high",
          authMode: "subscription"
        });
      } finally {
        await fixture.cleanup();
      }
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it("merges repo-defined Pi presets from the runtime manifest into the active policy", async () => {
    const fixture = await createRuntimeBootstrapFixture({
      runtimeManifestSource: renderSymphonyRuntimeManifestSource(({
        schemaVersion: 1,
        repositoryKey: "openai/symphony",
        linear: {
          teamKey: "SYM"
        },
        workspace: {
          packageManager: "pnpm",
          workingDirectory: "."
        },
        pi: {
          defaultPreset: "basic",
          presets: {
            basic: {
              model: "minimax/minimax-m2.7",
              reasoningEffort: "medium",
              auth: "provider"
            },
            advanced: {
              model: "xiaomi/mimo-v2-pro",
              reasoningEffort: "xhigh",
              auth: "provider"
            },
            premium: {
              model: "gpt-5.4",
              reasoningEffort: "high",
              auth: "subscription"
            }
          }
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
              name: "verify",
              run: "pnpm test"
            }
          ],
          seed: [],
          cleanup: []
        }
      }) as never),
      environmentSource: {
        SYMPHONY_PI_PROFILE: "mimo-v2-pro"
      }
    });
    try {
      const bootstrap = await loadRuntimeServiceBootstrap({
        env: fixture.env,
        environmentSource: fixture.environmentSource
      });
      const runtimeManifest = bootstrap.selectedRuntimeManifestEntry?.runtimeManifest.manifest;

      expect(runtimeManifest).not.toBeNull();

      const mergedPolicy = applyRuntimeManifestPiPolicy(
        bootstrap.runtimePolicy,
        runtimeManifest!
      );

      expect(mergedPolicy.pi.defaultPreset).toBe("basic");
      expect(mergedPolicy.pi.presets.basic).toEqual({
        model: "minimax/minimax-m2.7",
        reasoningEffort: "medium",
        authMode: "provider"
      });
      expect(mergedPolicy.pi.presets.premium).toEqual({
        model: "gpt-5.4",
        reasoningEffort: "high",
        authMode: "subscription"
      });
      expect(mergedPolicy.pi.defaultModel).toBe("minimax/minimax-m2.7");
      expect(mergedPolicy.agentRuntime.defaultPreset).toBe("basic");
      expect(mergedPolicy.agentRuntime.defaultModel).toBe(
        "minimax/minimax-m2.7"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("builds workspace backend payloads with mounted Pi auth and provider env", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-pi-auth-"));
    tempDirectories.push(root);
    const home = path.join(root, "home");
    await mkdir(path.join(home, ".pi", "agent"), {
      recursive: true
    });
    await writeFile(
      path.join(home, ".pi", "agent", "auth.json"),
      '{"ok":true}\n'
    );

    const dockerAuth = resolveDockerWorkspaceAuthContracts(
      {
        HOME: home,
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      },
      {
        preferredApiKeyEnvKey: "OPENROUTER_API_KEY"
      }
    );

    expect(
      buildWorkspaceBackendPayload({
        workspaceRoot: "/tmp/workspaces",
        metadata: {
          backendKind: "docker"
        },
        dockerGitHubCliAuth: dockerAuth.githubCli,
        dockerLinearLaunchEnv: {
          LINEAR_API_KEY: "test-linear-api-key"
        },
        dockerPiAuth: dockerAuth.pi
      })
    ).toEqual(
      expect.objectContaining({
        backendKind: "docker",
        dockerGitHubCliAuthMode: "none",
        dockerGitHubCliAuthEnvKey: null,
        dockerLinearApiKeyInjected: true,
        dockerPiAuthMounted: true,
        dockerPiProviderEnvKey: "OPENROUTER_API_KEY",
        dockerPiProviderEnvMounted: true
      })
    );
  });

  it("builds workspace backend payloads that prefer GH_TOKEN env injection", () => {
    const dockerAuth = resolveDockerWorkspaceAuthContracts(
      {
        GH_TOKEN: "test-gh-token",
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      },
      {
        preferredApiKeyEnvKey: "OPENROUTER_API_KEY"
      }
    );

    expect(
      buildWorkspaceBackendPayload({
        workspaceRoot: "/tmp/workspaces",
        metadata: {
          backendKind: "docker"
        },
        dockerGitHubCliAuth: dockerAuth.githubCli,
        dockerLinearLaunchEnv: {
          LINEAR_API_KEY: "test-linear-api-key"
        },
        dockerPiAuth: dockerAuth.pi
      })
    ).toEqual(
      expect.objectContaining({
        dockerGitHubCliAuthMode: "env",
        dockerGitHubCliAuthEnvKey: "GH_TOKEN",
        dockerLinearApiKeyInjected: true
      })
    );
  });

  it(
    "reconciles active persisted runs during shutdown",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness();
      harnesses.push(harness);

      const seededAt = new Date().toISOString();
      const seedDb = initializeSymphonyDb({
        dbFile: harness.env.dbFile
      });

      seedDb.client.prepare(`
      insert into symphony_issues (
        issue_identifier, tracker_issue_id, repository_key, latest_run_started_at, inserted_at, updated_at
      ) values (?, ?, ?, ?, ?, ?)
    `).run(
      "COL-SHUTDOWN",
      "issue-shutdown",
      "owner/repo",
      seededAt,
      seededAt,
      seededAt
    );
      seedDb.client.prepare(`
      insert into symphony_runs (
        run_id, repository_key, issue_identifier, attempt, status, outcome, worker_host,
        workspace_path, started_at, ended_at, metadata, error_class, error_message, inserted_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "run-shutdown",
      "owner/repo",
      "COL-SHUTDOWN",
      1,
      "running",
      null,
      null,
      "/tmp/workspace",
      seededAt,
      null,
      null,
      null,
      null,
      seededAt,
      seededAt
    );
      seedDb.client.prepare(`
      insert into symphony_turns (
        turn_id, run_id, turn_sequence, thread_id, agent_turn_id,
        prompt_text, status, started_at, ended_at, usage, metadata, inserted_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "turn-shutdown",
      "run-shutdown",
      1,
      "thread-shutdown",
      null,
      "Continue the issue.",
      "running",
      seededAt,
      null,
      null,
      null,
      seededAt,
      seededAt
    );
      seedDb.close();

      await harness.services.shutdown();

      const verifyDb = initializeSymphonyDb({
        dbFile: harness.env.dbFile
      });

      const run = verifyDb.client.prepare(`
      select status, outcome, error_class as errorClass, error_message as errorMessage
      from symphony_runs
      where run_id = ?
    `).get("run-shutdown") as {
      status: string;
      outcome: string | null;
      errorClass: string | null;
      errorMessage: string | null;
    };
      const turn = verifyDb.client.prepare(`
      select status
      from symphony_turns
      where turn_id = ?
    `).get("turn-shutdown") as { status: string };
      expect(run).toEqual(
        expect.objectContaining({
          status: "paused",
          outcome: "runtime_shutdown",
          errorClass: "runtime_shutdown",
          errorMessage: "Symphony runtime shut down while the run was active."
        })
      );
      expect(turn.status).toBe("stopped");

      verifyDb.close();
    },
    runtimeServicesIntegrationTestTimeoutMs
  );
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000
): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for runtime services to settle.");
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

async function createRuntimeBootstrapFixture(input: {
  env?: Partial<SymphonyRuntimeAppEnv>;
  environmentSource?: Record<string, string | undefined>;
  promptTemplate?: string;
  rootPrefix?: string;
  runtimeManifestSource?: string | null;
} = {}): Promise<{
  cleanup(): Promise<void>;
  env: SymphonyRuntimeAppEnv;
  environmentSource: Record<string, string | undefined>;
}> {
  const sqlite = await createTempSymphonySqliteHarness({
    rootPrefix: input.rootPrefix ?? "symphony-runtime-bootstrap-"
  });
  const root = sqlite.root;
  const workspaceRoot = path.join(root, "workspaces");
  const sourceRepo = path.join(root, "source-repo");
  const promptPath = path.join(sourceRepo, ".symphony", "prompt.md");

  await mkdir(workspaceRoot, {
    recursive: true
  });

  const env = {
    port: 4_400,
    dbFile: sqlite.dbFile,
    sourceRepo,
    sourceRepos: [sourceRepo],
    dockerWorkspaceImage: null,
    dockerMaterializationMode: "bind_mount" as const,
    dockerWorkspacePath: null,
    dockerContainerNamePrefix: null,
    dockerShell: null,
    dockerGitUserName: null,
    dockerGitUserEmail: null,
    dockerSharedPostgresContainerName: "symphony-shared-postgres",
    dockerSharedPostgresImage: "postgres:16",
    dockerSharedPostgresHost: "host.docker.internal",
    dockerSharedPostgresHostPort: 55_432,
    dockerSharedPostgresContainerPort: 5_432,
    dockerSharedPostgresAdminDatabase: "postgres",
    dockerSharedPostgresAdminUsername: "postgres",
    dockerSharedPostgresAdminPassword: "postgres",
    dockerSharedPostgresDatabasePrefix: "symphony",
    dockerSharedPostgresRolePrefix: "symphony",
    allowedOrigins: [],
    linearApiKey: "test-linear-api-key",
    logLevel: "error",
    ...input.env
  } satisfies SymphonyRuntimeAppEnv;

  if (env.sourceRepo) {
    await mkdir(path.join(env.sourceRepo, ".symphony"), {
      recursive: true
    });
    await writeFile(promptPath, `${input.promptTemplate ?? "Prompt body"}\n`);

    if (input.runtimeManifestSource !== null) {
      await writeFile(
        path.join(env.sourceRepo, ".symphony", "runtime.ts"),
        input.runtimeManifestSource ?? renderSymphonyRuntimeManifestSource()
      );
    }
  }

  const environmentSource = {
    LINEAR_API_KEY: env.linearApiKey,
    SYMPHONY_SOURCE_REPO: env.sourceRepo ?? undefined,
    SYMPHONY_SOURCE_REPOS:
      env.sourceRepos.length > 0 ? env.sourceRepos.join(",") : undefined,
    SYMPHONY_TRACKER_KIND: "memory",
    SYMPHONY_WORKSPACE_ROOT: workspaceRoot,
    SYMPHONY_POLL_INTERVAL_MS: "50",
    SYMPHONY_GITHUB_REPOSITORY: "openai/symphony",
    SYMPHONY_GITHUB_WEBHOOK_SECRET: "secret",
    SYMPHONY_GITHUB_ALLOWED_REVIEW_LOGINS: "reviewer",
    SYMPHONY_GITHUB_ALLOWED_REVIEW_COMMENT_LOGINS: "",
    SYMPHONY_GITHUB_ALLOWED_REWORK_LOGINS: "reviewer",
    ...input.environmentSource
  };

  return {
    env,
    environmentSource,
    async cleanup() {
      await rm(root, {
        recursive: true,
        force: true
      });
    }
  };
}

async function createMultiRepoRuntimeBootstrapFixture(): Promise<{
  cleanup(): Promise<void>;
  env: SymphonyRuntimeAppEnv;
  environmentSource: Record<string, string | undefined>;
  expectedPromptPath: string;
}> {
  const sqlite = await createTempSymphonySqliteHarness({
    rootPrefix: "symphony-runtime-services-multi-repo-"
  });
  const root = sqlite.root;
  const workspaceRoot = path.join(root, "workspaces");
  const symphonyRepo = path.join(root, "symphony");
  const coldetsRepo = path.join(root, "coldets");

  await mkdir(workspaceRoot, {
    recursive: true
  });
  await writeRuntimeRepositoryFixture({
    repoRoot: symphonyRepo,
    prompt: "Symphony prompt\n",
    manifest: buildRuntimeManifest({
      repositoryKey: "conacts/symphony",
      teamKey: "SYM",
      defaultPreset: "basic",
      premiumModel: "gpt-4.1"
    })
  });
  await writeRuntimeRepositoryFixture({
    repoRoot: coldetsRepo,
    prompt: "Coldets prompt\n",
    manifest: buildRuntimeManifest({
      repositoryKey: "conacts/coldets-v2",
      teamKey: "COL",
      defaultPreset: "premium",
      premiumModel: "gpt-5.4"
    })
  });

  const env = {
    port: 4_400,
    dbFile: sqlite.dbFile,
    sourceRepo: symphonyRepo,
    sourceRepos: [symphonyRepo, coldetsRepo],
    dockerWorkspaceImage: null,
    dockerMaterializationMode: "bind_mount" as const,
    dockerWorkspacePath: null,
    dockerContainerNamePrefix: null,
    dockerShell: null,
    dockerGitUserName: null,
    dockerGitUserEmail: null,
    dockerSharedPostgresContainerName: "symphony-shared-postgres",
    dockerSharedPostgresImage: "postgres:16",
    dockerSharedPostgresHost: "host.docker.internal",
    dockerSharedPostgresHostPort: 55_432,
    dockerSharedPostgresContainerPort: 5_432,
    dockerSharedPostgresAdminDatabase: "postgres",
    dockerSharedPostgresAdminUsername: "postgres",
    dockerSharedPostgresAdminPassword: "postgres",
    dockerSharedPostgresDatabasePrefix: "symphony",
    dockerSharedPostgresRolePrefix: "symphony",
    allowedOrigins: [],
    linearApiKey: "test-linear-api-key",
    logLevel: "error"
  } satisfies SymphonyRuntimeAppEnv;
  const environmentSource = {
    LINEAR_API_KEY: env.linearApiKey,
    SYMPHONY_SOURCE_REPO: env.sourceRepo ?? undefined,
    SYMPHONY_SOURCE_REPOS: env.sourceRepos.join(","),
    SYMPHONY_TRACKER_KIND: "linear",
    SYMPHONY_LINEAR_TEAM_KEY: "COL",
    SYMPHONY_WORKSPACE_ROOT: workspaceRoot,
    SYMPHONY_POLL_INTERVAL_MS: "50",
    SYMPHONY_GITHUB_REPOSITORY: "conacts/coldets-v2",
    SYMPHONY_GITHUB_WEBHOOK_SECRET: "secret",
    SYMPHONY_GITHUB_ALLOWED_REVIEW_LOGINS: "reviewer",
    SYMPHONY_GITHUB_ALLOWED_REVIEW_COMMENT_LOGINS: "",
    SYMPHONY_GITHUB_ALLOWED_REWORK_LOGINS: "reviewer"
  };

  return {
    env,
    environmentSource,
    expectedPromptPath: path.join(coldetsRepo, ".symphony", "prompt.md"),
    async cleanup() {
      await sqlite.cleanup();
    }
  };
}

async function writeRuntimeRepositoryFixture(input: {
  repoRoot: string;
  prompt: string;
  manifest: string;
}): Promise<void> {
  await mkdir(path.join(input.repoRoot, ".symphony"), {
    recursive: true
  });
  await writeFile(path.join(input.repoRoot, ".symphony", "prompt.md"), input.prompt);
  await writeFile(path.join(input.repoRoot, ".symphony", "runtime.ts"), input.manifest);
}

function buildRuntimeManifest(input: {
  repositoryKey: string;
  teamKey: string;
  defaultPreset: "basic" | "premium";
  premiumModel: string;
}): string {
  return renderSymphonyRuntimeManifestSource({
    schemaVersion: 1,
    repositoryKey: input.repositoryKey,
    linear: {
      teamKey: input.teamKey
    },
    workspace: {
      packageManager: "pnpm",
      workingDirectory: "."
    },
    pi: {
      defaultPreset: input.defaultPreset,
      presets: {
        basic: {
          model: "minimax/minimax-m2.7",
          reasoningEffort: "medium",
          auth: "provider"
        },
        advanced: {
          model: "xiaomi/mimo-v2-pro",
          reasoningEffort: "xhigh",
          auth: "provider"
        },
        premium: {
          model: input.premiumModel,
          reasoningEffort: "high",
          auth: "subscription"
        }
      }
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
          name: "verify",
          run: "pnpm test"
        }
      ],
      seed: [],
      cleanup: []
    }
  });
}
