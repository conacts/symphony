import { describe, expect, it } from "vitest";
import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import {
  normalizePiThinkingLevel,
  resolvePiIssueSelection
} from "./model-selection.js";
import { resolvePiLaunchSettings } from "./rpc-process.js";

describe("pi model selection", () => {
  it("applies issue labels on top of provided defaults", () => {
    const selection = resolvePiIssueSelection(
      buildIssue({
        labels: ["symphony:model:gpt-5.4-mini", "symphony:reasoning:high"]
      }),
      {
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "xhigh"
      }
    );

    expect(selection).toEqual({
      model: "gpt-5.4-mini",
      reasoningEffort: "high"
    });
  });

  it("normalizes unsupported thinking levels to medium", () => {
    expect(normalizePiThinkingLevel("off")).toBe("off");
    expect(normalizePiThinkingLevel("MINIMAL")).toBe("minimal");
    expect(normalizePiThinkingLevel("wild-west")).toBe("medium");
    expect(normalizePiThinkingLevel("high")).toBe("high");
    expect(normalizePiThinkingLevel(null)).toBeNull();
  });

  it("uses the same issue override rules for native rpc launches", () => {
    const launchSettings = resolvePiLaunchSettings({
      issue: buildIssue({
        labels: ["symphony:model:gpt-5.4", "symphony:reasoning:high"]
      }),
      runtimePolicy: buildRuntimePolicy({
        pi: {
          defaultModel: "xiaomi/mimo-v2-pro",
          defaultReasoningEffort: "xhigh",
          provider: {
            id: "openrouter",
            name: "OpenRouter",
            baseUrl: "https://openrouter.ai/api/v1",
            envKey: "OPENROUTER_API_KEY",
            supportsWebsockets: false,
            wireApi: "responses"
          }
        }
      }),
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/workspace",
        hostWorkspacePath: "/tmp/workspace",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-123",
        containerName: "symphony-col-123",
        shell: "sh"
      },
      env: {},
      logger: {
        debug() {},
        warn() {},
        error() {}
      }
    });

    expect(launchSettings).toMatchObject({
      model: "gpt-5.4",
      reasoningEffort: "high",
      providerId: "openrouter",
      providerName: "OpenRouter"
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
    projectSlug: null,
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
      projectSlug: "symphony",
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
      provider: null,
      turnTimeoutMs: 3_600_000,
      readTimeoutMs: 5_000,
      stallTimeoutMs: 300_000,
      ...overrides.pi
    },
    agentRuntime: {
      command: "pi",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: null,
      profile: null,
      defaultModel: null,
      defaultReasoningEffort: null,
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
