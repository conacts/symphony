import path from "node:path";
import { tmpdir } from "node:os";
import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";

export function buildSymphonyWorkflowConfig(
  overrides: Partial<SymphonyResolvedWorkflowConfig> = {}
): SymphonyResolvedWorkflowConfig {
  return {
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      projectSlug: "coldets",
      teamKey: null,
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "In Progress", "Rework"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "In Progress",
      claimTransitionFromStates: ["Todo", "Rework"],
      startupFailureTransitionToState: "Backlog",
      ...overrides.tracker
    },
    polling: {
      intervalMs: 5_000,
      ...overrides.polling
    },
    workspace: {
      root: path.join(tmpdir(), "symphony-test-workspaces"),
      ...overrides.workspace
    },
    worker: {
      sshHosts: [],
      maxConcurrentAgentsPerHost: null,
      ...overrides.worker
    },
    agent: {
      maxConcurrentAgents: 10,
      maxTurns: 20,
      maxRetryBackoffMs: 300_000,
      maxConcurrentAgentsByState: {},
      ...overrides.agent
    },
    codex: {
      command: "codex app-server",
      approvalPolicy: {
        reject: {
          sandbox_approval: true
        }
      },
      threadSandbox: "workspace-write",
      turnSandboxPolicy: null,
      turnTimeoutMs: 3_600_000,
      readTimeoutMs: 5_000,
      stallTimeoutMs: 300_000,
      ...overrides.codex
    },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60_000,
      ...overrides.hooks
    },
    observability: {
      dashboardEnabled: true,
      refreshMs: 1_000,
      renderIntervalMs: 16,
      ...overrides.observability
    },
    server: {
      port: null,
      host: "0.0.0.0",
      ...overrides.server
    },
    github: {
      repo: "openai/symphony",
      webhookSecret: null,
      apiToken: null,
      statePath: null,
      allowedReviewLogins: [],
      allowedReworkCommentLogins: [],
      ...overrides.github
    }
  };
}
