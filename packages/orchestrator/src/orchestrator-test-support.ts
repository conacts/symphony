import { tmpdir } from "node:os";
import path from "node:path";
import {
  deriveSymphonyRunMode
} from "@symphony/runtime-contract";
import type {
  SymphonyTracker,
  SymphonyTrackerConfig,
  SymphonyTrackerIssue
} from "@symphony/tracker";
export { buildSymphonyTrackerIssue } from "@symphony/tracker";
export { createTestWorkspaceBackend } from "@symphony/workspace/test-support";
import type {
  SymphonyAgentRuntimeConfig,
  SymphonyOrchestratorConfig
} from "./orchestrator-config.js";
import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyDispatchBootstrapRouter,
  SymphonyRunLifecycleRouter,
  SymphonyRunStartActivationRouter
} from "./symphony-orchestrator-types.js";
import { prepareIssueForDispatch } from "./symphony-orchestrator.js";

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
        defaultPreset: "advanced",
        presets: buildDefaultPiPresetsForTests({
          defaultModel: null,
          defaultReasoningEffort: null
        }),
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
        defaultPreset: "advanced",
        presets: buildDefaultPiPresetsForTests({
          defaultModel: null,
          defaultReasoningEffort: null
        }),
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

export function createTestOrchestratorRoutingAdapters(input: {
  config: SymphonyOrchestratorConfig;
  tracker: SymphonyTracker;
  overrides?: Partial<{
    dispatchBootstrapRouter: SymphonyDispatchBootstrapRouter;
    runStartActivationRouter: SymphonyRunStartActivationRouter;
    runLifecycleRouter: SymphonyRunLifecycleRouter;
  }>;
}): {
  dispatchBootstrapRouter: SymphonyDispatchBootstrapRouter;
  runStartActivationRouter: SymphonyRunStartActivationRouter;
  runLifecycleRouter: SymphonyRunLifecycleRouter;
} {
  return {
    dispatchBootstrapRouter:
      input.overrides?.dispatchBootstrapRouter ?? {
        async route(routeInput) {
          return {
            issue: await prepareIssueForDispatch(
              input.config,
              input.tracker,
              routeInput.issue
            ),
            runMode: deriveSymphonyRunMode(routeInput.issue.state)
          };
        }
      },
    runStartActivationRouter:
      input.overrides?.runStartActivationRouter ?? {
        async activate(activationInput) {
          return {
            issue: await transitionIssueStateIfNeeded(
              input.tracker,
              activationInput.issue,
              resolveActivationTargetState(activationInput)
            )
          };
        }
      },
    runLifecycleRouter:
      input.overrides?.runLifecycleRouter ?? {
        async observeIssueState(observationInput) {
          return {
            issue: observationInput.issue
          };
        },
        async routeCompletion(completionInput) {
          return {
            issue: await transitionIssueStateIfNeeded(
              input.tracker,
              completionInput.issue,
              resolveCompletionTargetState({
                config: input.config,
                completion: completionInput.completion,
                runMode: completionInput.runMode
              })
            )
          };
        }
      }
  };
}

async function transitionIssueStateIfNeeded(
  tracker: SymphonyTracker,
  issue: SymphonyTrackerIssue,
  targetState: string | null
): Promise<SymphonyTrackerIssue> {
  if (
    !targetState ||
    issue.state.trim().toLowerCase() === targetState.trim().toLowerCase()
  ) {
    return issue;
  }

  await tracker.updateIssueState(issue.id, targetState);
  return {
    ...issue,
    state: targetState
  };
}

function resolveActivationTargetState(input: {
  issue: SymphonyTrackerIssue;
  runMode: string;
}): string | null {
  const normalizedState = input.issue.state.trim().toLowerCase();

  if (normalizedState === "bootstrapping") {
    return "In Progress";
  }

  if (
    input.runMode === "approved_merge" &&
    normalizedState === "approved"
  ) {
    return "In Progress";
  }

  return null;
}

function resolveCompletionTargetState(input: {
  config: SymphonyOrchestratorConfig;
  completion: SymphonyAgentRuntimeCompletion;
  runMode: string;
}): string | null {
  if (input.completion.kind === "delivered") {
    return "In Review";
  }

  if (input.completion.kind === "startup_failure") {
    return input.config.tracker.startupFailureTransitionToState;
  }

  if (input.completion.kind === "blocked") {
    return input.config.tracker.blockedTransitionToState;
  }

  if (input.runMode === "approved_merge") {
    if (input.completion.kind === "merged") {
      return "Done";
    }

    if (
      input.completion.kind === "merge_blocked" ||
      input.completion.kind === "failure" ||
      input.completion.kind === "stalled" ||
      input.completion.kind === "max_turns_reached"
    ) {
      return input.config.tracker.blockedTransitionToState;
    }
  }

  if (
    input.completion.kind === "failure" ||
    input.completion.kind === "rate_limited" ||
    input.completion.kind === "stalled" ||
    input.completion.kind === "max_turns_reached"
  ) {
    return input.config.tracker.pauseTransitionToState;
  }

  return null;
}

function buildDefaultPiPresetsForTests(input: {
  defaultModel: string | null;
  defaultReasoningEffort: string | null;
}): Record<
  string,
  {
    model: string | null;
    reasoningEffort: string | null;
    authMode: "provider" | "subscription";
  }
> {
  return {
    basic: {
      model: input.defaultModel,
      reasoningEffort: "medium",
      authMode: "provider"
    },
    advanced: {
      model: input.defaultModel,
      reasoningEffort: input.defaultReasoningEffort ?? "xhigh",
      authMode: "provider"
    },
    premium: {
      model: "gpt-5.4",
      reasoningEffort: "high",
      authMode: "subscription"
    }
  };
}
