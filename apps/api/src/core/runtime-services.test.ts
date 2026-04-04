import { afterEach, describe, expect, it } from "vitest";
import {
  createSymphonyRuntimeAppServicesHarness,
  type SymphonyRuntimeAppServicesHarness
} from "../test-support/create-symphony-runtime-app-services-harness.js";
import { renderSymphonyRuntimeManifestSource } from "@symphony/test-support";

const harnesses: SymphonyRuntimeAppServicesHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
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
        }
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

  it("fails fast when docker-backed runs do not have host-owned Codex auth", async () => {
    await expect(
      createSymphonyRuntimeAppServicesHarness({
        hostCommandEnvSource: {}
      })
    ).rejects.toThrowError(/Docker-backed Symphony workspaces require host-owned Codex auth/i);
  });

  it("accepts an OpenRouter api key when the mimo-v2-pro profile is selected", async () => {
    const harness = await createSymphonyRuntimeAppServicesHarness({
      environmentSource: {
        LINEAR_API_KEY: "test-linear-api-key",
        SYMPHONY_CODEX_PROFILE: "mimo-v2-pro"
      },
      hostCommandEnvSource: {
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      }
    });
    harnesses.push(harness);

    expect(harness.services.runtimePolicy.codex.profile).toBe("mimo-v2-pro");
    expect(harness.services.runtimePolicy.codex.defaultModel).toBe(
      "xiaomi/mimo-v2-pro"
    );
    expect(harness.services.runtimePolicy.codex.defaultReasoningEffort).toBe(
      "high"
    );
    expect(harness.services.runtimePolicy.codex.provider).toEqual({
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      envKey: "OPENROUTER_API_KEY",
      supportsWebsockets: false,
      wireApi: "responses"
    });
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
