import { describe, expect, it } from "vitest";
import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import {
  normalizePiThinkingLevel,
  resolvePiIssueSelection
} from "./model-selection.js";
import { resolvePiLaunchSettings } from "./launch.js";

describe("pi model selection", () => {
  it("applies issue labels on top of provided defaults", () => {
    const selection = resolvePiIssueSelection(
      buildIssue({
        labels: ["model:gpt-5.4-mini", "symphony:reasoning:high"]
      }),
      {
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "xhigh"
      }
    );

    expect(selection).toEqual({
      presetName: null,
      model: "gpt-5.4-mini",
      reasoningEffort: "high",
      authMode: "provider"
    });
  });

  it("resolves repo-defined Pi presets from model labels", () => {
    const selection = resolvePiIssueSelection(
      buildIssue({
        labels: ["model:basic"]
      }),
      {
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "xhigh",
        defaultPreset: "advanced",
        presets: {
          basic: {
            model: "gpt-5.4-mini",
            reasoningEffort: "medium",
            authMode: "provider"
          },
          advanced: {
            model: "xiaomi/mimo-v2-pro",
            reasoningEffort: "xhigh",
            authMode: "provider"
          }
        }
      }
    );

    expect(selection).toEqual({
      presetName: "basic",
      model: "gpt-5.4-mini",
      reasoningEffort: "medium",
      authMode: "provider"
    });
  });

  it("uses subscription auth for the premium preset", () => {
    const selection = resolvePiIssueSelection(
      buildIssue({
        labels: ["model:premium"]
      }),
      {
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "xhigh",
        defaultPreset: "advanced",
        presets: {
          basic: {
            model: "minimax/minimax-m2.7",
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
        }
      }
    );

    expect(selection).toEqual({
      presetName: "premium",
      model: "gpt-5.4",
      reasoningEffort: "high",
      authMode: "subscription"
    });
  });

  it("normalizes unsupported thinking levels to medium", () => {
    expect(normalizePiThinkingLevel("off")).toBe("off");
    expect(normalizePiThinkingLevel("MINIMAL")).toBe("minimal");
    expect(normalizePiThinkingLevel("wild-west")).toBe("medium");
    expect(normalizePiThinkingLevel("high")).toBe("high");
    expect(normalizePiThinkingLevel(null)).toBeNull();
  });

  it("uses the same issue override rules for SDK launches", () => {
    const runtimePolicy = buildRuntimePolicy({
      pi: {
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "xhigh",
        defaultPreset: "advanced",
        presets: {
          basic: {
            model: "minimax/minimax-m2.7",
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
        }
      }
    });
    const launchSettings = resolvePiLaunchSettings(
      "pi --profile advanced",
      buildIssue({
        labels: ["model:premium"]
      }),
      {
        model: runtimePolicy.pi.defaultModel,
        reasoningEffort: runtimePolicy.pi.defaultReasoningEffort,
        defaultPreset: runtimePolicy.pi.defaultPreset,
        presets: runtimePolicy.pi.presets,
        profile: runtimePolicy.pi.profile,
        providerId: runtimePolicy.pi.provider?.id ?? null,
        providerName: runtimePolicy.pi.provider?.name ?? null
      }
    );

    expect(launchSettings).toMatchObject({
      command: "pi --profile advanced",
      executable: "pi",
      model: "gpt-5.4",
      reasoningEffort: "high",
      providerId: null,
      providerName: null
    });
  });
});

function buildIssue(
  overrides: Partial<{
    labels: string[];
  }> = {}
) {
  return {
    id: "issue-1",
    identifier: "COL-1",
    title: "Test issue",
    description: null,
    priority: null,
    state: "Todo",
    branchName: null,
    url: null,
    projectId: null,
    projectName: null,
    teamKey: null,
    assigneeId: null,
    blockedBy: [],
    labels: overrides.labels ?? [],
    assignedToWorker: false,
    createdAt: null,
    updatedAt: null
  };
}

function buildRuntimePolicy(
  overrides: {
    pi?: Partial<SymphonyAgentRuntimeConfig["pi"]>;
    agentRuntime?: Partial<SymphonyAgentRuntimeConfig["agentRuntime"]>;
  } = {}
): SymphonyAgentRuntimeConfig {
  return {
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      teamKey: "SYM",
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "Bootstrapping", "In Progress"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "Bootstrapping",
      claimTransitionFromStates: ["Todo"],
      startupFailureTransitionToState: "Failed",
      pauseTransitionToState: "Paused",
      blockedTransitionToState: "Blocked"
    },
    workspace: {
      root: "/tmp/workspaces"
    },
    agent: {
      harness: "pi",
      maxTurns: 20
    },
    pi: {
      profile: null,
      defaultModel: null,
      defaultReasoningEffort: null,
      defaultPreset: "advanced",
      presets: {
        basic: {
          model: null,
          reasoningEffort: "medium",
          authMode: "provider"
        },
        advanced: {
          model: null,
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
      stallTimeoutMs: 300_000,
      ...overrides.pi,
      toolTimeoutMs: overrides.pi?.toolTimeoutMs ?? 900_000
    },
    agentRuntime: {
      command: "pi",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: null,
      profile: null,
      defaultModel: null,
      defaultReasoningEffort: null,
      defaultPreset: "advanced",
      presets: {
        basic: {
          model: null,
          reasoningEffort: "medium",
          authMode: "provider"
        },
        advanced: {
          model: null,
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
      stallTimeoutMs: 300_000,
      ...overrides.agentRuntime
    },
    hooks: {
      timeoutMs: 60_000
    }
  };
}
