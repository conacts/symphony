import { tmpdir } from "node:os";
import path from "node:path";
import type { SymphonyTrackerConfig } from "@symphony/tracker";
export { buildSymphonyTrackerIssue } from "@symphony/tracker";
export { createTestWorkspaceBackend } from "@symphony/workspace/test-support";
import type {
  SymphonyAgentRuntimeConfig,
  SymphonyOrchestratorConfig
} from "./orchestrator-config.js";

export function buildSymphonyOrchestratorConfig(overrides: {
  tracker?: Partial<SymphonyTrackerConfig>;
  polling?: Partial<SymphonyOrchestratorConfig["polling"]>;
  workspace?: Partial<SymphonyOrchestratorConfig["workspace"]>;
  hooks?: Partial<SymphonyOrchestratorConfig["hooks"]>;
  agent?: Partial<SymphonyOrchestratorConfig["agent"]>;
  agentRuntime?: Partial<SymphonyOrchestratorConfig["agentRuntime"]>;
  runtime?: {
    tracker?: Partial<SymphonyAgentRuntimeConfig["tracker"]>;
    workspace?: Partial<SymphonyAgentRuntimeConfig["workspace"]>;
    agent?: Partial<SymphonyAgentRuntimeConfig["agent"]>;
    pi?: Partial<SymphonyAgentRuntimeConfig["pi"]>;
    agentRuntime?: Partial<SymphonyAgentRuntimeConfig["agentRuntime"]>;
    hooks?: Partial<SymphonyAgentRuntimeConfig["hooks"]>;
  };
} = {}): SymphonyOrchestratorConfig {
  const workspaceRoot =
    overrides.workspace?.root ?? path.join(tmpdir(), "symphony-test-workspaces");

  const tracker: SymphonyTrackerConfig = {
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
    startupFailureTransitionToState: "Backlog",
    pauseTransitionToState: "Paused",
    ...overrides.tracker
  };

  const workspace = {
    root: workspaceRoot,
    ...overrides.workspace
  };
  const hooks = {
    afterCreate: null,
    beforeRun: null,
    afterRun: null,
    beforeRemove: null,
    timeoutMs: 60_000,
    ...overrides.hooks
  };

  return {
    tracker,
    polling: {
      intervalMs: 5_000,
      ...overrides.polling
    },
    workspace,
    hooks,
    agent: {
      maxConcurrentAgents: 10,
      maxRetryBackoffMs: 300_000,
      maxConcurrentAgentsByState: {},
      ...overrides.agent
    },
    agentRuntime: {
      stallTimeoutMs: 300_000,
      ...overrides.agentRuntime
    },
    runtime: {
      tracker: {
        ...tracker,
        ...overrides.runtime?.tracker
      },
      workspace: {
        root: workspace.root,
        ...overrides.runtime?.workspace
      },
      agent: {
        harness: "pi",
        maxTurns: 20,
        ...overrides.runtime?.agent
      },
      pi: {
        profile: null,
        defaultModel: null,
        defaultReasoningEffort: null,
        provider: null,
        turnTimeoutMs: 3_600_000,
        readTimeoutMs: 5_000,
        stallTimeoutMs: 300_000,
        ...overrides.runtime?.pi
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
        ...overrides.runtime?.agentRuntime
      },
      hooks: {
        timeoutMs: hooks.timeoutMs,
        ...overrides.runtime?.hooks
      }
    }
  };
}
