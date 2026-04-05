import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import { describe, expect, it } from "vitest";
import { resolveAgentHarnessModule } from "./registry.js";
import {
  resolveHarnessModelRuntimePolicy,
  resolveHarnessModuleModelRuntimePolicy,
  resolveHarnessProviderEnvKey
} from "./runtime-policy.js";

function createRuntimePolicy(
  overrides: Partial<SymphonyAgentRuntimeConfig> = {}
): SymphonyAgentRuntimeConfig {
  return {
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      projectSlug: "coldets",
      teamKey: null,
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "Bootstrapping", "In Progress", "Rework"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "Bootstrapping",
      claimTransitionFromStates: ["Todo", "Rework"],
      startupFailureTransitionToState: "Failed",
      pauseTransitionToState: "Paused"
    },
    workspace: {
      root: "/workspace"
    },
    agent: {
      harness: "codex",
      maxTurns: 20
    },
    codex: {
      command: "codex",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: null,
      profile: "gpt-5.4",
      defaultModel: "gpt-5.4",
      defaultReasoningEffort: "high",
      provider: {
        id: "openai",
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        envKey: "OPENAI_API_KEY",
        supportsWebsockets: true,
        wireApi: "responses"
      },
      turnTimeoutMs: 3_600_000,
      readTimeoutMs: 5_000
    },
    opencode: {
      profile: "glm-5-turbo",
      defaultModel: "z-ai/glm-5-turbo",
      defaultReasoningEffort: "high",
      provider: {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        envKey: "OPENROUTER_API_KEY",
        supportsWebsockets: false,
        wireApi: "responses"
      }
    },
    pi: {
      profile: "mimo-v2-pro",
      defaultModel: "xiaomi/mimo-v2-pro",
      defaultReasoningEffort: "high",
      provider: {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        envKey: "OPENROUTER_API_KEY",
        supportsWebsockets: false,
        wireApi: "responses"
      }
    },
    hooks: {
      timeoutMs: 150_000
    },
    ...overrides
  };
}

describe("harness runtime policy helpers", () => {
  it("resolves the active harness model policy without falling back to codex defaults", () => {
    const config = createRuntimePolicy({
      agent: {
        harness: "pi",
        maxTurns: 20
      }
    });

    expect(resolveHarnessModelRuntimePolicy(config)).toEqual(config.pi);
    expect(resolveHarnessProviderEnvKey(config)).toBe("OPENROUTER_API_KEY");
  });

  it("resolves module-scoped policy for non-active harnesses", () => {
    const config = createRuntimePolicy({
      agent: {
        harness: "pi",
        maxTurns: 20
      }
    });
    const opencode = resolveAgentHarnessModule("opencode");

    expect(resolveHarnessModuleModelRuntimePolicy(config, opencode)).toEqual(
      config.opencode
    );
    expect(resolveHarnessProviderEnvKey(config, "opencode")).toBe(
      "OPENROUTER_API_KEY"
    );
  });

  it("returns null when the selected harness does not require a provider env key", () => {
    const config = createRuntimePolicy({
      agent: {
        harness: "pi",
        maxTurns: 20
      },
      pi: {
        profile: "mimo-v2-pro",
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "high",
        provider: null
      }
    });

    expect(resolveHarnessProviderEnvKey(config)).toBeNull();
  });
});
