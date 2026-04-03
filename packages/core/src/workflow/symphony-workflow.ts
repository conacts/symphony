import path from "node:path";
import { tmpdir } from "node:os";
import { SymphonyWorkflowError } from "./symphony-workflow-errors.js";
import {
  getNestedRecord,
  normalizeApprovalPolicy,
  normalizeIssueState,
  normalizeNonNegativeInteger,
  normalizeOptionalPositiveInteger,
  normalizeOptionalRecord,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeStateLimits,
  normalizeStringArray,
  normalizeTrackerKind,
  resolveEnvToken
} from "./symphony-workflow-values.js";

export type SymphonyWorkflowEnv = Record<string, string | undefined>;

export type SymphonyWorkflowTrackerConfig = {
  kind: "linear" | "memory";
  endpoint: string;
  apiKey: string | null;
  projectSlug: string | null;
  teamKey: string | null;
  excludedProjectIds: string[];
  assignee: string | null;
  dispatchableStates: string[];
  terminalStates: string[];
  claimTransitionToState: string | null;
  claimTransitionFromStates: string[];
  startupFailureTransitionToState: string | null;
};

export type SymphonyWorkflowPollingConfig = {
  intervalMs: number;
};

export type SymphonyWorkflowWorkspaceConfig = {
  root: string;
};

export type SymphonyWorkflowWorkerConfig = {
  sshHosts: string[];
  maxConcurrentAgentsPerHost: number | null;
};

export type SymphonyWorkflowAgentConfig = {
  maxConcurrentAgents: number;
  maxTurns: number;
  maxRetryBackoffMs: number;
  maxConcurrentAgentsByState: Record<string, number>;
};

export type SymphonyWorkflowCodexConfig = {
  command: string;
  approvalPolicy: string | Record<string, unknown>;
  threadSandbox: string;
  turnSandboxPolicy: Record<string, unknown> | null;
  turnTimeoutMs: number;
  readTimeoutMs: number;
  stallTimeoutMs: number;
};

export type SymphonyWorkflowHooksConfig = {
  afterCreate: string | null;
  beforeRun: string | null;
  afterRun: string | null;
  beforeRemove: string | null;
  timeoutMs: number;
};

export type SymphonyWorkflowObservabilityConfig = {
  dashboardEnabled: boolean;
  refreshMs: number;
  renderIntervalMs: number;
};

export type SymphonyWorkflowServerConfig = {
  port: number | null;
  host: string;
};

export type SymphonyWorkflowGitHubConfig = {
  repo: string | null;
  webhookSecret: string | null;
  apiToken: string | null;
  statePath: string | null;
  allowedReviewLogins: string[];
  allowedReworkCommentLogins: string[];
};

export type SymphonyResolvedWorkflowConfig = {
  tracker: SymphonyWorkflowTrackerConfig;
  polling: SymphonyWorkflowPollingConfig;
  workspace: SymphonyWorkflowWorkspaceConfig;
  worker: SymphonyWorkflowWorkerConfig;
  agent: SymphonyWorkflowAgentConfig;
  codex: SymphonyWorkflowCodexConfig;
  hooks: SymphonyWorkflowHooksConfig;
  observability: SymphonyWorkflowObservabilityConfig;
  server: SymphonyWorkflowServerConfig;
  github: SymphonyWorkflowGitHubConfig;
};

export type SymphonyWorkflowLoadOptions = {
  env?: SymphonyWorkflowEnv;
  cwd?: string;
  tempDir?: string;
};

export { SymphonyWorkflowError } from "./symphony-workflow-errors.js";
export { normalizeIssueState } from "./symphony-workflow-values.js";
export function resolveWorkflowConfig(
  rawConfig: Record<string, unknown>,
  options: SymphonyWorkflowLoadOptions
): SymphonyResolvedWorkflowConfig {
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

function normalizeTrackerConfig(
  value: unknown,
  env: SymphonyWorkflowEnv
): SymphonyWorkflowTrackerConfig {
  const tracker = getNestedRecord(value);
  const dispatchableStates = normalizeStringArray(
    tracker.dispatchableStates ?? tracker.activeStates,
    ["Todo", "In Progress"]
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
    )
  };
}

function normalizePollingConfig(value: unknown): SymphonyWorkflowPollingConfig {
  const polling = getNestedRecord(value);
  return {
    intervalMs: normalizePositiveInteger(polling.intervalMs, 30_000, "polling.intervalMs")
  };
}

function normalizeWorkspaceConfig(
  value: unknown,
  env: SymphonyWorkflowEnv,
  tempDir: string
): SymphonyWorkflowWorkspaceConfig {
  const workspace = getNestedRecord(value);
  return {
    root:
      normalizeOptionalString(resolveEnvToken(workspace.root, env)) ??
      path.join(tempDir, "symphony_workspaces")
  };
}

function normalizeWorkerConfig(value: unknown): SymphonyWorkflowWorkerConfig {
  const worker = getNestedRecord(value);
  return {
    sshHosts: normalizeStringArray(worker.sshHosts, []),
    maxConcurrentAgentsPerHost: normalizeOptionalPositiveInteger(
      worker.maxConcurrentAgentsPerHost,
      "worker.maxConcurrentAgentsPerHost"
    )
  };
}

function normalizeAgentConfig(value: unknown): SymphonyWorkflowAgentConfig {
  const agent = getNestedRecord(value);
  return {
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

function normalizeCodexConfig(value: unknown): SymphonyWorkflowCodexConfig {
  const codex = getNestedRecord(value);
  const rawCommand = codex.command;

  if (rawCommand === "") {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      "codex.command must not be blank."
    );
  }

  if (rawCommand !== undefined && typeof rawCommand !== "string") {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      "codex.command must be a string."
    );
  }

  return {
    command: typeof rawCommand === "string" ? rawCommand : "codex app-server",
    approvalPolicy: normalizeApprovalPolicy(codex.approvalPolicy),
    threadSandbox:
      normalizeOptionalString(codex.threadSandbox) ?? "workspace-write",
    turnSandboxPolicy: normalizeOptionalRecord(codex.turnSandboxPolicy),
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

function normalizeHooksConfig(value: unknown): SymphonyWorkflowHooksConfig {
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
): SymphonyWorkflowObservabilityConfig {
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

function normalizeServerConfig(value: unknown): SymphonyWorkflowServerConfig {
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
  env: SymphonyWorkflowEnv,
  workspaceRoot: string
): SymphonyWorkflowGitHubConfig {
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

function validateSemanticConfig(
  config: SymphonyResolvedWorkflowConfig
): void {
  const { tracker } = config;

  if (tracker.kind === "linear" && !tracker.apiKey) {
    throw new SymphonyWorkflowError(
      "missing_linear_api_token",
      "Linear tracker requires tracker.apiKey or LINEAR_API_KEY."
    );
  }

  if (
    tracker.kind === "linear" &&
    tracker.projectSlug &&
    tracker.teamKey
  ) {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      "Set either tracker.projectSlug or tracker.teamKey, not both."
    );
  }

  if (
    tracker.kind === "linear" &&
    !tracker.projectSlug &&
    !tracker.teamKey
  ) {
    throw new SymphonyWorkflowError(
      "missing_linear_tracker_scope",
      "Linear tracker requires tracker.projectSlug or tracker.teamKey."
    );
  }

  if (
    tracker.kind === "linear" &&
    tracker.projectSlug &&
    tracker.excludedProjectIds.length > 0
  ) {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      "tracker.excludedProjectIds requires tracker.teamKey and must not be used with tracker.projectSlug."
    );
  }

  if (
    !tracker.claimTransitionToState &&
    tracker.claimTransitionFromStates.length > 0
  ) {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      "tracker.claimTransitionToState is required when tracker.claimTransitionFromStates is set."
    );
  }

  const startupFailureState = normalizeIssueState(
    tracker.startupFailureTransitionToState
  );

  if (
    startupFailureState !== "" &&
    tracker.dispatchableStates.some(
      (stateName) => normalizeIssueState(stateName) === startupFailureState
    )
  ) {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      "tracker.startupFailureTransitionToState must not be one of tracker.dispatchableStates."
    );
  }
}
