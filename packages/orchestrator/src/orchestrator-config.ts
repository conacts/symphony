import type { SymphonyTrackerConfig } from "@symphony/tracker";
import type { WorkspaceConfig, WorkspaceHooksConfig } from "@symphony/workspace";

export type SymphonyAgentRuntimeConfig = {
  tracker: SymphonyTrackerConfig;
  workspace: Pick<WorkspaceConfig, "root">;
  agent: {
    harness: "pi";
    maxTurns: number;
  };
  pi: {
    profile: string | null;
    defaultModel: string | null;
    defaultReasoningEffort: string | null;
    defaultPreset: string;
    presets: Record<
      string,
      {
        model: string | null;
        reasoningEffort: string | null;
        authMode: "provider" | "subscription";
      }
    >;
    provider: {
      id: string | null;
      name: string | null;
      baseUrl: string | null;
      envKey: string | null;
      supportsWebsockets: boolean | null;
      wireApi: string | null;
    } | null;
    turnTimeoutMs: number;
    readTimeoutMs: number;
    stallTimeoutMs: number;
    toolTimeoutMs: number | null;
  };
  agentRuntime: {
    command: string;
    approvalPolicy: string | Record<string, unknown>;
    threadSandbox: string;
    turnSandboxPolicy: Record<string, unknown> | null;
    profile: string | null;
    defaultModel: string | null;
    defaultReasoningEffort: string | null;
    defaultPreset: string;
    presets: Record<
      string,
      {
        model: string | null;
        reasoningEffort: string | null;
        authMode: "provider" | "subscription";
      }
    >;
    provider: {
      id: string | null;
      name: string | null;
      baseUrl: string | null;
      envKey: string | null;
      supportsWebsockets: boolean | null;
      wireApi: string | null;
    } | null;
    turnTimeoutMs: number;
    readTimeoutMs: number;
    stallTimeoutMs: number;
  };
  hooks: Pick<WorkspaceHooksConfig, "timeoutMs">;
};

export type SymphonyOrchestratorConfig = {
  tracker: SymphonyTrackerConfig;
  polling: {
    intervalMs: number;
  };
  workspace: WorkspaceConfig;
  hooks: WorkspaceHooksConfig;
  agent: {
    maxConcurrentAgents: number;
    maxRetryBackoffMs: number;
    maxConcurrentAgentsByState: Record<string, number>;
  };
  agentRuntime: {
    stallTimeoutMs: number;
  };
  runtime: SymphonyAgentRuntimeConfig;
};
