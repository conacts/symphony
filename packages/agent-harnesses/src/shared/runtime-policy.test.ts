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
  const {
    tracker,
    workspace,
    agent,
    agentRuntime,
    pi,
    hooks
  } = overrides;

  return {
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      teamKey: "COL",
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "Bootstrapping", "In Progress", "Rework", "Approved"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "Bootstrapping",
      claimTransitionFromStates: ["Todo", "Rework"],
      startupFailureTransitionToState: "Failed",
      pauseTransitionToState: "Paused",
      blockedTransitionToState: "Blocked",
      ...tracker
    },
    workspace: {
      root: "/workspace",
      ...workspace
    },
    agent: {
      harness: "pi",
      maxTurns: 20,
      ...agent
    },
    agentRuntime: {
      command: "pi",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: null,
      profile: "gpt-5.4",
      defaultModel: "gpt-5.4",
      defaultReasoningEffort: "high",
      defaultPreset: "advanced",
      presets: {
        basic: {
          model: "gpt-5.4",
          reasoningEffort: "medium",
          authMode: "provider"
        },
        advanced: {
          model: "gpt-5.4",
          reasoningEffort: "xhigh",
          authMode: "provider"
        },
        premium: {
          model: "gpt-5.4",
          reasoningEffort: "high",
          authMode: "subscription"
        }
      },
      provider: {
        id: "openai",
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        envKey: "OPENAI_API_KEY",
        supportsWebsockets: true,
        wireApi: "responses"
      },
      turnTimeoutMs: 3_600_000,
      readTimeoutMs: 5_000,
      stallTimeoutMs: 300_000,
      ...agentRuntime
    },
    pi: {
      profile: "mimo-v2-pro",
      defaultModel: "xiaomi/mimo-v2-pro",
      defaultReasoningEffort: "high",
      defaultPreset: "advanced",
      presets: {
        basic: {
          model: "xiaomi/mimo-v2-pro",
          reasoningEffort: "medium",
          authMode: "provider"
        },
        advanced: {
          model: "xiaomi/mimo-v2-pro",
          reasoningEffort: "xhigh",
          authMode: "provider"
        },
        premium: {
          model: "gpt-5.4",
          reasoningEffort: "high",
          authMode: "subscription"
        }
      },
      provider: {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        envKey: "OPENROUTER_API_KEY",
        supportsWebsockets: false,
        wireApi: "responses"
      },
      turnTimeoutMs: 3_600_000,
      readTimeoutMs: 5_000,
      stallTimeoutMs: 300_000,
      ...pi
    },
    hooks: {
      timeoutMs: 150_000,
      ...hooks
    }
  };
}

describe("harness runtime policy helpers", () => {
  it("resolves the active harness model policy from the Pi runtime block", () => {
    const config = createRuntimePolicy({
      agent: {
        harness: "pi",
        maxTurns: 20
      }
    });

    expect(resolveHarnessModelRuntimePolicy(config)).toEqual(config.pi);
    expect(resolveHarnessProviderEnvKey(config)).toBe("OPENROUTER_API_KEY");
  });

  it("resolves module-scoped policy for the Pi harness", () => {
    const config = createRuntimePolicy();
    const pi = resolveAgentHarnessModule("pi");

    expect(resolveHarnessModuleModelRuntimePolicy(config, pi)).toEqual(config.pi);
    expect(resolveHarnessProviderEnvKey(config, "pi")).toBe("OPENROUTER_API_KEY");
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
        defaultPreset: "advanced",
        presets: {
          basic: {
            model: "xiaomi/mimo-v2-pro",
            reasoningEffort: "medium",
            authMode: "provider"
          },
          advanced: {
            model: "xiaomi/mimo-v2-pro",
            reasoningEffort: "xhigh",
            authMode: "provider"
          },
          premium: {
            model: "gpt-5.4",
            reasoningEffort: "high",
            authMode: "subscription"
          }
        },
        provider: null,
        turnTimeoutMs: 3_600_000,
        readTimeoutMs: 5_000,
        stallTimeoutMs: 300_000
      }
    });

    expect(resolveHarnessProviderEnvKey(config)).toBeNull();
  });
});
