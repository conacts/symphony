import path from "node:path";
import { tmpdir } from "node:os";
import {
  normalizeIssueState,
  type SymphonyTrackerConfig
} from "@symphony/tracker";
import { SymphonyRuntimePolicyError } from "./runtime-policy-errors.js";
import {
  normalizeAgentHarness,
  getNestedRecord,
  normalizeApprovalPolicy,
  normalizeNonNegativeInteger,
  normalizeOptionalPositiveInteger,
  normalizeOptionalRecord,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeStateLimits,
  normalizeStringArray,
  normalizeTrackerKind,
  resolveEnvToken
} from "./runtime-policy-values.js";

export type SymphonyRuntimePolicyEnv = Record<string, string | undefined>;
export type SymphonyWorkflowEnv = SymphonyRuntimePolicyEnv;

export type SymphonyTrackerRuntimePolicy = SymphonyTrackerConfig;
export type SymphonyWorkflowTrackerConfig = SymphonyTrackerRuntimePolicy;

export type SymphonyPollingRuntimePolicy = {
  intervalMs: number;
};
export type SymphonyWorkflowPollingConfig = SymphonyPollingRuntimePolicy;

export type SymphonyWorkspaceRuntimePolicy = {
  root: string;
};
export type SymphonyWorkflowWorkspaceConfig = SymphonyWorkspaceRuntimePolicy;

export type SymphonyWorkerRuntimePolicy = {
  sshHosts: string[];
  maxConcurrentAgentsPerHost: number | null;
};
export type SymphonyWorkflowWorkerConfig = SymphonyWorkerRuntimePolicy;

export type SymphonyAgentRuntimePolicy = {
  harness: "pi";
  maxConcurrentAgents: number;
  maxTurns: number;
  maxRetryBackoffMs: number;
  maxConcurrentAgentsByState: Record<string, number>;
};
export type SymphonyWorkflowAgentConfig = SymphonyAgentRuntimePolicy;

export type SymphonyHarnessProviderRuntimePolicy = {
  id: string | null;
  name: string | null;
  baseUrl: string | null;
  envKey: string | null;
  supportsWebsockets: boolean | null;
  wireApi: string | null;
} | null;

export type SymphonyHarnessModelAuthModeRuntimePolicy =
  | "provider"
  | "subscription";

export type SymphonyHarnessModelPresetRuntimePolicy = {
  model: string | null;
  reasoningEffort: string | null;
  authMode: SymphonyHarnessModelAuthModeRuntimePolicy;
};

export const defaultSymphonyPiPresetName = "advanced";

export type SymphonyHarnessModelRuntimePolicy = {
  profile: string | null;
  defaultModel: string | null;
  defaultReasoningEffort: string | null;
  defaultPreset: string;
  presets: Record<string, SymphonyHarnessModelPresetRuntimePolicy>;
  provider: SymphonyHarnessProviderRuntimePolicy;
};

export type SymphonyAgentRuntimeExecutionPolicy = SymphonyHarnessModelRuntimePolicy & {
  command: string;
  approvalPolicy: string | Record<string, unknown>;
  threadSandbox: string;
  turnSandboxPolicy: Record<string, unknown> | null;
  turnTimeoutMs: number;
  readTimeoutMs: number;
  stallTimeoutMs: number;
};
export type SymphonyWorkflowAgentRuntimeExecutionConfig = SymphonyAgentRuntimeExecutionPolicy;
export type SymphonyWorkflowHarnessModelConfig = SymphonyHarnessModelRuntimePolicy;
export type SymphonyPiRuntimePolicy = SymphonyHarnessModelRuntimePolicy & {
  turnTimeoutMs: number;
  readTimeoutMs: number;
  stallTimeoutMs: number;
  toolTimeoutMs: number | null;
};

export type SymphonyHooksRuntimePolicy = {
  afterCreate: string | null;
  beforeRun: string | null;
  afterRun: string | null;
  beforeRemove: string | null;
  timeoutMs: number;
};
export type SymphonyWorkflowHooksConfig = SymphonyHooksRuntimePolicy;

export type SymphonyObservabilityRuntimePolicy = {
  dashboardEnabled: boolean;
  refreshMs: number;
  renderIntervalMs: number;
};
export type SymphonyWorkflowObservabilityConfig =
  SymphonyObservabilityRuntimePolicy;

export type SymphonyServerRuntimePolicy = {
  port: number | null;
  host: string;
};
export type SymphonyWorkflowServerConfig = SymphonyServerRuntimePolicy;

export type SymphonyGitHubRuntimePolicy = {
  repo: string | null;
};
export type SymphonyWorkflowGitHubConfig = SymphonyGitHubRuntimePolicy;

export type SymphonyResolvedRuntimePolicy = {
  tracker: SymphonyTrackerRuntimePolicy;
  polling: SymphonyPollingRuntimePolicy;
  workspace: SymphonyWorkspaceRuntimePolicy;
  worker: SymphonyWorkerRuntimePolicy;
  agent: SymphonyAgentRuntimePolicy;
  agentRuntime: SymphonyAgentRuntimeExecutionPolicy;
  pi: SymphonyPiRuntimePolicy;
  hooks: SymphonyHooksRuntimePolicy;
  observability: SymphonyObservabilityRuntimePolicy;
  server: SymphonyServerRuntimePolicy;
  github: SymphonyGitHubRuntimePolicy;
};
export type SymphonyResolvedWorkflowConfig = SymphonyResolvedRuntimePolicy;

export type SymphonyRuntimePolicyLoadOptions = {
  env?: SymphonyRuntimePolicyEnv;
  cwd?: string;
  tempDir?: string;
};
export type SymphonyWorkflowLoadOptions = SymphonyRuntimePolicyLoadOptions;

export {
  SymphonyRuntimePolicyError
} from "./runtime-policy-errors.js";
export { normalizeIssueState } from "@symphony/tracker";

export function buildSymphonyDefaultPiPresets(input: {
  defaultModel: string | null;
  defaultReasoningEffort: string | null;
}): Record<string, SymphonyHarnessModelPresetRuntimePolicy> {
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

export function resolveRuntimePolicy(
  rawConfig: Record<string, unknown>,
  options: SymphonyRuntimePolicyLoadOptions
): SymphonyResolvedRuntimePolicy {
  const effectiveRawConfig =
    Object.keys(rawConfig).length === 0
      ? {
          tracker: {
            kind: "memory"
          }
        }
      : rawConfig;
  const env = options.env ?? {};
  const tempDir = options.tempDir ?? tmpdir();

  const tracker = normalizeTrackerConfig(effectiveRawConfig.tracker, env);
  const polling = normalizePollingConfig(effectiveRawConfig.polling);
  const workspace = normalizeWorkspaceConfig(
    effectiveRawConfig.workspace,
    env,
    tempDir
  );
  const worker = normalizeWorkerConfig(effectiveRawConfig.worker);
  const agent = normalizeAgentConfig(effectiveRawConfig.agent);
  const agentRuntime = normalizeAgentRuntimeConfig(
    effectiveRawConfig.agentRuntime
  );
  const pi = normalizePiConfig(effectiveRawConfig.pi);
  const hooks = normalizeHooksConfig(effectiveRawConfig.hooks);
  const observability = normalizeObservabilityConfig(
    effectiveRawConfig.observability
  );
  const server = normalizeServerConfig(effectiveRawConfig.server);
  const github = normalizeGitHubConfig(effectiveRawConfig.github, env);

  validateSemanticConfig({
    tracker,
    polling,
    workspace,
    worker,
    agent,
    agentRuntime,
    pi,
    hooks,
    observability,
    server,
    github
  });

  return {
    tracker,
    polling,
    workspace,
    worker,
    agent,
    agentRuntime,
    pi,
    hooks,
    observability,
    server,
    github
  };
}

export function resolveWorkflowConfig(
  rawConfig: Record<string, unknown>,
  options: SymphonyWorkflowLoadOptions
): SymphonyResolvedWorkflowConfig {
  return resolveRuntimePolicy(rawConfig, options);
}

function normalizeTrackerConfig(
  value: unknown,
  env: SymphonyRuntimePolicyEnv
): SymphonyTrackerRuntimePolicy {
  const tracker = getNestedRecord(value);
  const dispatchableStates = normalizeStringArray(
    tracker.dispatchableStates ?? tracker.activeStates,
    ["Todo", "Bootstrapping", "In Progress"]
  );

  return {
    kind: normalizeTrackerKind(tracker.kind),
    endpoint:
      normalizeOptionalString(resolveEnvToken(tracker.endpoint, env)) ??
      "https://api.linear.app/graphql",
    apiKey:
      normalizeOptionalString(resolveEnvToken(tracker.apiKey, env)) ??
      normalizeOptionalString(env.LINEAR_API_KEY) ??
      null,
    teamKey: normalizeOptionalString(resolveEnvToken(tracker.teamKey, env)),
    excludedProjectIds: normalizeStringArray(tracker.excludedProjectIds, []),
    assignee:
      normalizeOptionalString(resolveEnvToken(tracker.assignee, env)) ??
      normalizeOptionalString(env.LINEAR_ASSIGNEE) ??
      null,
    dispatchableStates,
    terminalStates: normalizeStringArray(tracker.terminalStates, [
      "Canceled",
      "Done"
    ]),
    claimTransitionToState: normalizeOptionalString(
      resolveEnvToken(tracker.claimTransitionToState, env)
    ),
    claimTransitionFromStates: normalizeStringArray(
      tracker.claimTransitionFromStates,
      []
    ),
    startupFailureTransitionToState: normalizeOptionalString(
      resolveEnvToken(tracker.startupFailureTransitionToState, env)
    ),
    pauseTransitionToState: normalizeOptionalString(
      resolveEnvToken(tracker.pauseTransitionToState, env)
    ),
    blockedTransitionToState:
      normalizeOptionalString(
        resolveEnvToken(tracker.blockedTransitionToState, env)
      ) ?? "Blocked"
  };
}

function normalizePollingConfig(value: unknown): SymphonyPollingRuntimePolicy {
  const polling = getNestedRecord(value);
  return {
    intervalMs: normalizePositiveInteger(polling.intervalMs, 30_000, "polling.intervalMs")
  };
}

function normalizeWorkspaceConfig(
  value: unknown,
  env: SymphonyRuntimePolicyEnv,
  tempDir: string
): SymphonyWorkspaceRuntimePolicy {
  const workspace = getNestedRecord(value);
  return {
    root:
      normalizeOptionalString(resolveEnvToken(workspace.root, env)) ??
      path.join(tempDir, "symphony_workspaces")
  };
}

function normalizeWorkerConfig(value: unknown): SymphonyWorkerRuntimePolicy {
  const worker = getNestedRecord(value);
  return {
    sshHosts: normalizeStringArray(worker.sshHosts, []),
    maxConcurrentAgentsPerHost: normalizeOptionalPositiveInteger(
      worker.maxConcurrentAgentsPerHost,
      "worker.maxConcurrentAgentsPerHost"
    )
  };
}

function normalizeAgentConfig(value: unknown): SymphonyAgentRuntimePolicy {
  const agent = getNestedRecord(value);
  const normalizedHarness = normalizeAgentHarness(agent.harness);

  return {
    harness: normalizedHarness,
    maxConcurrentAgents: normalizePositiveInteger(
      agent.maxConcurrentAgents,
      10,
      "agent.maxConcurrentAgents"
    ),
    maxTurns: normalizePositiveInteger(agent.maxTurns, 20, "agent.maxTurns"),
    maxRetryBackoffMs: normalizePositiveInteger(
      agent.maxRetryBackoffMs,
      300_000,
      "agent.maxRetryBackoffMs"
    ),
    maxConcurrentAgentsByState: normalizeStateLimits(
      agent.maxConcurrentAgentsByState
    )
  };
}

function normalizeHarnessModelConfig(
  value: unknown
): SymphonyHarnessModelRuntimePolicy {
  const config = getNestedRecord(value);
  const defaultModel = normalizeOptionalString(config.defaultModel);
  const defaultReasoningEffort = normalizeOptionalString(
    config.defaultReasoningEffort
  );
  const defaultPreset =
    normalizeOptionalString(config.defaultPreset) ?? defaultSymphonyPiPresetName;

  return {
    profile: normalizeOptionalString(config.profile),
    defaultModel,
    defaultReasoningEffort,
    defaultPreset,
    presets: normalizeHarnessModelPresets(config.presets, {
      defaultModel,
      defaultReasoningEffort
    }),
    provider: normalizeHarnessProviderConfig(config.provider)
  };
}

function normalizeHarnessModelPresets(
  value: unknown,
  defaults: {
    defaultModel: string | null;
    defaultReasoningEffort: string | null;
  }
): Record<string, SymphonyHarnessModelPresetRuntimePolicy> {
  const presets = getNestedRecord(value);
  const normalized = Object.fromEntries(
    Object.entries(presets).map(([presetName, presetValue]) => {
      const preset = getNestedRecord(presetValue);
      return [
        presetName,
        {
          model: normalizeOptionalString(preset.model),
          reasoningEffort: normalizeOptionalString(preset.reasoningEffort),
          authMode:
            normalizeOptionalString(preset.authMode) === "subscription"
              ? "subscription"
              : "provider"
        }
      ];
    })
  ) as Record<string, SymphonyHarnessModelPresetRuntimePolicy>;

  return Object.keys(normalized).length > 0
    ? normalized
    : buildSymphonyDefaultPiPresets(defaults);
}

function normalizePiConfig(value: unknown): SymphonyPiRuntimePolicy {
  const pi = getNestedRecord(value);

  return {
    ...normalizeHarnessModelConfig(pi),
    turnTimeoutMs: normalizePositiveInteger(
      pi.turnTimeoutMs,
      3_600_000,
      "pi.turnTimeoutMs"
    ),
    readTimeoutMs: normalizePositiveInteger(
      pi.readTimeoutMs,
      5_000,
      "pi.readTimeoutMs"
    ),
    stallTimeoutMs: normalizeNonNegativeInteger(
      pi.stallTimeoutMs,
      300_000,
      "pi.stallTimeoutMs"
    ),
    toolTimeoutMs:
      pi.toolTimeoutMs === undefined || pi.toolTimeoutMs === null
        ? 900_000
        : normalizeOptionalPositiveInteger(pi.toolTimeoutMs, "pi.toolTimeoutMs")
  };
}

function normalizeAgentRuntimeConfig(
  value: unknown
): SymphonyAgentRuntimeExecutionPolicy {
  const agentRuntime = getNestedRecord(value);
  const rawCommand = agentRuntime.command;

  if (rawCommand === "") {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "agentRuntime.command must not be blank."
    );
  }

  if (rawCommand !== undefined && typeof rawCommand !== "string") {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "agentRuntime.command must be a string."
    );
  }

  return {
    command: typeof rawCommand === "string" ? rawCommand : "pi",
    approvalPolicy: normalizeApprovalPolicy(agentRuntime.approvalPolicy),
    threadSandbox:
      normalizeOptionalString(agentRuntime.threadSandbox) ?? "danger-full-access",
    turnSandboxPolicy: normalizeOptionalRecord(agentRuntime.turnSandboxPolicy),
    ...normalizeHarnessModelConfig(agentRuntime),
    turnTimeoutMs: normalizePositiveInteger(
      agentRuntime.turnTimeoutMs,
      3_600_000,
      "agentRuntime.turnTimeoutMs"
    ),
    readTimeoutMs: normalizePositiveInteger(
      agentRuntime.readTimeoutMs,
      5_000,
      "agentRuntime.readTimeoutMs"
    ),
    stallTimeoutMs: normalizeNonNegativeInteger(
      agentRuntime.stallTimeoutMs,
      300_000,
      "agentRuntime.stallTimeoutMs"
    )
  };
}

function normalizeHarnessProviderConfig(
  value: unknown
): SymphonyHarnessProviderRuntimePolicy {
  const provider = getNestedRecord(value);
  return Object.keys(provider).length === 0
    ? null
    : {
        id: normalizeOptionalString(provider.id),
        name: normalizeOptionalString(provider.name),
        baseUrl: normalizeOptionalString(provider.baseUrl),
        envKey: normalizeOptionalString(provider.envKey),
        supportsWebsockets:
          typeof provider.supportsWebsockets === "boolean"
            ? provider.supportsWebsockets
            : null,
        wireApi: normalizeOptionalString(provider.wireApi)
      };
}

function normalizeHooksConfig(value: unknown): SymphonyHooksRuntimePolicy {
  const hooks = getNestedRecord(value);
  return {
    afterCreate: normalizeOptionalString(hooks.afterCreate),
    beforeRun: normalizeOptionalString(hooks.beforeRun),
    afterRun: normalizeOptionalString(hooks.afterRun),
    beforeRemove: normalizeOptionalString(hooks.beforeRemove),
    timeoutMs: normalizePositiveInteger(hooks.timeoutMs, 60_000, "hooks.timeoutMs")
  };
}

function normalizeObservabilityConfig(
  value: unknown
): SymphonyObservabilityRuntimePolicy {
  const observability = getNestedRecord(value);
  return {
    dashboardEnabled:
      typeof observability.dashboardEnabled === "boolean"
        ? observability.dashboardEnabled
        : true,
    refreshMs: normalizePositiveInteger(
      observability.refreshMs,
      1_000,
      "observability.refreshMs"
    ),
    renderIntervalMs: normalizePositiveInteger(
      observability.renderIntervalMs,
      16,
      "observability.renderIntervalMs"
    )
  };
}

function normalizeServerConfig(value: unknown): SymphonyServerRuntimePolicy {
  const server = getNestedRecord(value);
  return {
    port:
      server.port === null || server.port === undefined
        ? null
        : normalizeNonNegativeInteger(server.port, 0, "server.port"),
    host: normalizeOptionalString(server.host) ?? "0.0.0.0"
  };
}

function normalizeGitHubConfig(
  value: unknown,
  env: SymphonyRuntimePolicyEnv
): SymphonyGitHubRuntimePolicy {
  const github = getNestedRecord(value);
  return {
    repo: normalizeOptionalString(resolveEnvToken(github.repo, env))
  };
}

function validateSemanticConfig(config: SymphonyResolvedRuntimePolicy): void {
  const { tracker } = config;

  if (tracker.kind === "linear" && !tracker.apiKey) {
    throw new SymphonyRuntimePolicyError(
      "missing_linear_api_token",
      "Linear tracker requires tracker.apiKey or LINEAR_API_KEY."
    );
  }

  if (
    tracker.kind === "linear" &&
    !tracker.teamKey
  ) {
    throw new SymphonyRuntimePolicyError(
      "missing_linear_tracker_scope",
      "Linear tracker requires tracker.teamKey."
    );
  }

  if (
    !tracker.claimTransitionToState &&
    tracker.claimTransitionFromStates.length > 0
  ) {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "tracker.claimTransitionToState is required when tracker.claimTransitionFromStates is set."
    );
  }

  const startupFailureState = normalizeIssueState(
    tracker.startupFailureTransitionToState
  );
  const pausedState = normalizeIssueState(tracker.pauseTransitionToState);
  const blockedState = normalizeIssueState(tracker.blockedTransitionToState);

  if (
    startupFailureState !== "" &&
    tracker.dispatchableStates.some(
      (stateName) => normalizeIssueState(stateName) === startupFailureState
    )
  ) {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "tracker.startupFailureTransitionToState must not be one of tracker.dispatchableStates."
    );
  }

  if (
    pausedState !== "" &&
    tracker.dispatchableStates.some(
      (stateName) => normalizeIssueState(stateName) === pausedState
    )
  ) {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "tracker.pauseTransitionToState must not be one of tracker.dispatchableStates."
    );
  }

  if (
    blockedState !== "" &&
    tracker.dispatchableStates.some(
      (stateName) => normalizeIssueState(stateName) === blockedState
    )
  ) {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "tracker.blockedTransitionToState must not be one of tracker.dispatchableStates."
    );
  }
}
