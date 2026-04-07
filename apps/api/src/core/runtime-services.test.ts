import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSymphonyRuntimeAppServicesHarness,
  type SymphonyRuntimeAppServicesHarness
} from "../test-support/create-symphony-runtime-app-services-harness.js";
import { renderSymphonyRuntimeManifestSource } from "@symphony/test-support";
import { initializeSymphonyDb } from "@symphony/db";

const harnesses: SymphonyRuntimeAppServicesHarness[] = [];
const tempDirectories: string[] = [];

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
  it("loads the default app services through the explicit prompt and runtime contract", async () => {
    const harness = await createSymphonyRuntimeAppServicesHarness();
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
        })
      })
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
  });

  it("fails fast when the source repo runtime manifest is missing", async () => {
    await expect(
      createSymphonyRuntimeAppServicesHarness({
        runtimeManifestSource: null
      })
    ).rejects.toThrowError(/Missing Symphony runtime manifest/i);
  });

  it("fails fast when required host env from the runtime manifest is missing", async () => {
    await expect(
      createSymphonyRuntimeAppServicesHarness({
        runtimeManifestSource: renderSymphonyRuntimeManifestSource({
          schemaVersion: 1,
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
        }),
        environmentSource: {
          LINEAR_API_KEY: "test-linear-api-key"
        }
      })
    ).rejects.toThrowError(/Required host environment variable OPENAI_API_KEY is missing/i);
  });

  it("fails fast when docker-backed runs do not have Pi auth or a provider api key", async () => {
    await expect(
      createSymphonyRuntimeAppServicesHarness({
        hostCommandEnvSource: {}
      })
    ).rejects.toThrowError(/Docker-backed Symphony workspaces require Pi auth/i);
  });

  it("accepts an OpenRouter api key for the Pi default profile", async () => {
    const harness = await createSymphonyRuntimeAppServicesHarness({
      environmentSource: {
        LINEAR_API_KEY: "test-linear-api-key",
        SYMPHONY_PI_PROFILE: "mimo-v2-pro"
      },
      hostCommandEnvSource: {
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      }
    });
    harnesses.push(harness);

    expect(harness.services.runtimePolicy.agent.harness).toBe("pi");
    expect(harness.services.runtimePolicy.agentRuntime.command).toBe("pi");
    expect(harness.services.runtimePolicy.pi.profile).toBe("mimo-v2-pro");
    expect(harness.services.runtimePolicy.pi.defaultModel).toBe(
      "xiaomi/mimo-v2-pro"
    );
    expect(harness.services.runtimePolicy.pi.defaultReasoningEffort).toBe(
      "high"
    );
    expect(harness.services.runtimePolicy.pi.provider).toEqual({
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      envKey: "OPENROUTER_API_KEY",
      supportsWebsockets: false,
      wireApi: "responses"
    });
  });

  it("loads runtime services with the Pi harness by default", async () => {
    const harness = await createSymphonyRuntimeAppServicesHarness({
      environmentSource: {
        SYMPHONY_PI_PROFILE: "mimo-v2-pro"
      },
      hostCommandEnvSource: {
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      }
    });
    harnesses.push(harness);

    expect(harness.services.runtimePolicy.agent.harness).toBe("pi");
    expect(harness.services.runtimePolicy.agentRuntime.command).toBe("pi");
    expect(harness.services.runtimePolicy.agentRuntime.readTimeoutMs).toBe(
      120_000
    );
    expect(harness.services.runtimePolicy.pi.profile).toBe("mimo-v2-pro");
    expect(harness.services.runtimePolicy.pi.defaultModel).toBe(
      "xiaomi/mimo-v2-pro"
    );
    expect(harness.services.runtimePolicy.pi.provider).toEqual({
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      envKey: "OPENROUTER_API_KEY",
      supportsWebsockets: false,
      wireApi: "responses"
    });
  });

  it("merges repo-defined Pi presets from the runtime manifest into the active policy", async () => {
    const harness = await createSymphonyRuntimeAppServicesHarness({
      runtimeManifestSource: renderSymphonyRuntimeManifestSource({
        schemaVersion: 1,
        workspace: {
          packageManager: "pnpm",
          workingDirectory: "."
        },
        pi: {
          defaultPreset: "basic",
          presets: {
            basic: {
              model: "gpt-5.4-mini",
              reasoningEffort: "medium"
            },
            advanced: {
              model: "xiaomi/mimo-v2-pro",
              reasoningEffort: "xhigh"
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
      }),
      environmentSource: {
        SYMPHONY_PI_PROFILE: "mimo-v2-pro"
      },
      hostCommandEnvSource: {
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      }
    });
    harnesses.push(harness);

    expect(harness.services.runtimePolicy.pi.defaultPreset).toBe("basic");
    expect(harness.services.runtimePolicy.pi.presets.basic).toEqual({
      model: "gpt-5.4-mini",
      reasoningEffort: "medium"
    });
    expect(harness.services.runtimePolicy.pi.defaultModel).toBe("gpt-5.4-mini");
    expect(harness.services.runtimePolicy.agentRuntime.defaultPreset).toBe("basic");
    expect(harness.services.runtimePolicy.agentRuntime.defaultModel).toBe(
      "gpt-5.4-mini"
    );
  });

  it("mounts standard Pi auth alongside the configured provider env for docker runs", async () => {
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

    const harness = await createSymphonyRuntimeAppServicesHarness({
      environmentSource: {
        SYMPHONY_AGENT_HARNESS: "pi",
        SYMPHONY_PI_PROFILE: "mimo-v2-pro"
      },
      hostCommandEnvSource: {
        HOME: home,
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      }
    });
    harnesses.push(harness);

    const selectedBackendLog = (await harness.services.runtimeLogs.list()).logs.find(
      (entry) => entry.eventType === "workspace_backend_selected"
    );

    expect(selectedBackendLog?.payload).toEqual(
      expect.objectContaining({
        dockerGitHubCliAuthMode: "none",
        dockerGitHubCliAuthEnvKey: null,
        dockerLinearApiKeyInjected: true,
        dockerPiAuthMounted: true,
        dockerPiProviderEnvKey: "OPENROUTER_API_KEY",
        dockerPiProviderEnvMounted: true
      })
    );
  });

  it("prefers GH_TOKEN env injection over mounting host gh config for docker runs", async () => {
    const harness = await createSymphonyRuntimeAppServicesHarness({
      hostCommandEnvSource: {
        GH_TOKEN: "test-gh-token",
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      }
    });
    harnesses.push(harness);

    const selectedBackendLog = (await harness.services.runtimeLogs.list()).logs.find(
      (entry) => entry.eventType === "workspace_backend_selected"
    );

    expect(selectedBackendLog?.payload).toEqual(
      expect.objectContaining({
        dockerGitHubCliAuthMode: "env",
        dockerGitHubCliAuthEnvKey: "GH_TOKEN",
        dockerLinearApiKeyInjected: true
      })
    );
  });

  it("reconciles active persisted runs during shutdown", async () => {
    const harness = await createSymphonyRuntimeAppServicesHarness();
    harnesses.push(harness);

    const seededAt = new Date().toISOString();
    const seedDb = initializeSymphonyDb({
      dbFile: harness.env.dbFile
    });

    seedDb.client.prepare(`
      insert into symphony_runs (
        run_id, issue_id, issue_identifier, attempt, status, outcome, worker_host, workspace_path,
        started_at, ended_at, metadata, error_class, error_message, inserted_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "run-shutdown",
      "issue-shutdown",
      "COL-SHUTDOWN",
      0,
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
        turn_id, run_id, turn_sequence, thread_id, agent_turn_id, session_id,
        prompt_text, status, started_at, ended_at, usage, metadata, inserted_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "turn-shutdown",
      "run-shutdown",
      1,
      "thread-shutdown",
      null,
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
    seedDb.client.prepare(`
      insert into symphony_agent_runs (
        run_id, thread_id, harness_kind, model, provider_id, provider_name, issue_id, issue_identifier,
        started_at, ended_at, status, failure_kind, failure_origin, failure_message_preview, final_turn_id,
        last_agent_message_item_id, last_agent_message_preview, last_agent_message_overflow_id,
        input_tokens, cached_input_tokens, output_tokens, turn_count, item_count, command_count, tool_call_count,
        file_change_count, agent_message_count, reasoning_count, error_count, latest_event_at, latest_event_type,
        inserted_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "run-shutdown",
      "thread-shutdown",
      "pi",
      "xiaomi/mimo-v2-pro",
      "openrouter",
      "OpenRouter",
      "issue-shutdown",
      "COL-SHUTDOWN",
      seededAt,
      null,
      "running",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      seededAt,
      "thread.started",
      seededAt,
      seededAt
    );
    seedDb.client.prepare(`
      insert into symphony_agent_turns (
        turn_id, run_id, thread_id, harness_kind, model, provider_id, provider_name,
        started_at, ended_at, status, failure_kind, failure_message_preview, last_agent_message_item_id,
        last_agent_message_preview, last_agent_message_overflow_id, input_tokens, cached_input_tokens, output_tokens,
        item_count, command_count, tool_call_count, file_change_count, agent_message_count, reasoning_count, error_count,
        latest_event_at, latest_event_type, inserted_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "turn-shutdown",
      "run-shutdown",
      "thread-shutdown",
      "pi",
      "xiaomi/mimo-v2-pro",
      "openrouter",
      "OpenRouter",
      seededAt,
      null,
      "running",
      null,
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      seededAt,
      "thread.started",
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
    const agentRun = verifyDb.client.prepare(`
      select status, failure_kind as failureKind
      from symphony_agent_runs
      where run_id = ?
    `).get("run-shutdown") as {
      status: string;
      failureKind: string | null;
    };
    const agentTurn = verifyDb.client.prepare(`
      select status, failure_kind as failureKind
      from symphony_agent_turns
      where turn_id = ?
    `).get("turn-shutdown") as {
      status: string;
      failureKind: string | null;
    };

    expect(run).toEqual(
      expect.objectContaining({
        status: "paused",
        outcome: "runtime_shutdown",
        errorClass: "runtime_shutdown",
        errorMessage: "Symphony runtime shut down while the run was active."
      })
    );
    expect(turn.status).toBe("stopped");
    expect(agentRun).toEqual({
      status: "paused",
      failureKind: "runtime_shutdown"
    });
    expect(agentTurn).toEqual({
      status: "stopped",
      failureKind: "runtime_shutdown"
    });

    verifyDb.close();
  });
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
