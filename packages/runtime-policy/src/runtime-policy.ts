import path from "node:path";
import { tmpdir } from "node:os";
import {
  normalizeIssueState,
  type SymphonyTrackerConfig
} from "@symphony/tracker";
import { SymphonyRuntimePolicyError } from "./runtime-policy-errors.js";
import {
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
  harness: "codex" | "opencode" | "pi";
  maxConcurrentAgents: number;
  maxTurns: number;
  maxRetryBackoffMs: number;
  maxConcurrentAgentsByState: Record<string, number>;
};
export type SymphonyWorkflowAgentConfig = SymphonyAgentRuntimePolicy;

export type SymphonyCodexRuntimePolicy = {
  command: string;
  approvalPolicy: string | Record<string, unknown>;
  threadSandbox: string;
  turnSandboxPolicy: Record<string, unknown> | null;
  profile: string | null;
  defaultModel: string | null;
  defaultReasoningEffort: string | null;
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
export type SymphonyWorkflowCodexConfig = SymphonyCodexRuntimePolicy;

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
  webhookSecret: string | null;
  apiToken: string | null;
  statePath: string | null;
  allowedReviewLogins: string[];
  allowedReworkCommentLogins: string[];
};
export type SymphonyWorkflowGitHubConfig = SymphonyGitHubRuntimePolicy;

export type SymphonyResolvedRuntimePolicy = {
  tracker: SymphonyTrackerRuntimePolicy;
  polling: SymphonyPollingRuntimePolicy;
  workspace: SymphonyWorkspaceRuntimePolicy;
  worker: SymphonyWorkerRuntimePolicy;
  agent: SymphonyAgentRuntimePolicy;
  codex: SymphonyCodexRuntimePolicy;
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
  const codex = normalizeCodexConfig(effectiveRawConfig.codex);
  const hooks = normalizeHooksConfig(effectiveRawConfig.hooks);
  const observability = normalizeObservabilityConfig(
    effectiveRawConfig.observability
  );
  const server = normalizeServerConfig(effectiveRawConfig.server);
  const github = normalizeGitHubConfig(
    effectiveRawConfig.github,
    env,
    workspace.root
  );

  validateSemanticConfig({
    tracker,
    polling,
    workspace,
    worker,
    agent,
    codex,
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
    codex,
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
    projectSlug: normalizeOptionalString(resolveEnvToken(tracker.projectSlug, env)),
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
    )
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
  const normalizedHarness = normalizeOptionalString(agent.harness) ?? "codex";

  if (!["codex", "opencode", "pi"].includes(normalizedHarness)) {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "agent.harness must be one of: codex, opencode, pi."
    );
  }

  const harness = normalizedHarness as SymphonyAgentRuntimePolicy["harness"];

  return {
    harness,
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

function normalizeCodexConfig(value: unknown): SymphonyCodexRuntimePolicy {
  const codex = getNestedRecord(value);
  const rawCommand = codex.command;
  const provider = getNestedRecord(codex.provider);

  if (rawCommand === "") {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "codex.command must not be blank."
    );
  }

  if (rawCommand !== undefined && typeof rawCommand !== "string") {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "codex.command must be a string."
    );
  }

  return {
    command: typeof rawCommand === "string" ? rawCommand : "codex",
    approvalPolicy: normalizeApprovalPolicy(codex.approvalPolicy),
    threadSandbox:
      normalizeOptionalString(codex.threadSandbox) ?? "danger-full-access",
    turnSandboxPolicy: normalizeOptionalRecord(codex.turnSandboxPolicy),
    profile: normalizeOptionalString(codex.profile),
    defaultModel: normalizeOptionalString(codex.defaultModel),
    defaultReasoningEffort: normalizeOptionalString(codex.defaultReasoningEffort),
    provider:
      Object.keys(provider).length === 0
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
          },
    turnTimeoutMs: normalizePositiveInteger(
      codex.turnTimeoutMs,
      3_600_000,
      "codex.turnTimeoutMs"
    ),
    readTimeoutMs: normalizePositiveInteger(
      codex.readTimeoutMs,
      5_000,
      "codex.readTimeoutMs"
    ),
    stallTimeoutMs: normalizeNonNegativeInteger(
      codex.stallTimeoutMs,
      300_000,
      "codex.stallTimeoutMs"
    )
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
  env: SymphonyRuntimePolicyEnv,
  workspaceRoot: string
): SymphonyGitHubRuntimePolicy {
  const github = getNestedRecord(value);
  return {
    repo: normalizeOptionalString(resolveEnvToken(github.repo, env)),
    webhookSecret:
      normalizeOptionalString(resolveEnvToken(github.webhookSecret, env)) ??
      normalizeOptionalString(env.GITHUB_WEBHOOK_SECRET) ??
      null,
    apiToken:
      normalizeOptionalString(resolveEnvToken(github.apiToken, env)) ??
      normalizeOptionalString(env.GITHUB_TOKEN) ??
      null,
    statePath:
      normalizeOptionalString(resolveEnvToken(github.statePath, env)) ??
      path.join(workspaceRoot, ".symphony", "github-state.json"),
    allowedReviewLogins: normalizeStringArray(github.allowedReviewLogins, []),
    allowedReworkCommentLogins: normalizeStringArray(
      github.allowedReworkCommentLogins,
      []
    )
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
    tracker.projectSlug &&
    tracker.teamKey
  ) {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "Set either tracker.projectSlug or tracker.teamKey, not both."
    );
  }

  if (
    tracker.kind === "linear" &&
    !tracker.projectSlug &&
    !tracker.teamKey
  ) {
    throw new SymphonyRuntimePolicyError(
      "missing_linear_tracker_scope",
      "Linear tracker requires tracker.projectSlug or tracker.teamKey."
    );
  }

  if (
    tracker.kind === "linear" &&
    tracker.projectSlug &&
    tracker.excludedProjectIds.length > 0
  ) {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      "tracker.excludedProjectIds requires tracker.teamKey and must not be used with tracker.projectSlug."
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
}
