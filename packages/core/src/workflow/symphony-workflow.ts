import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { isRecord } from "../internal/records.js";

export const defaultSymphonyWorkflowFileName = "WORKFLOW.md";

export const defaultSymphonyPromptTemplate = `You are working on a Linear issue.

Identifier: {{ issue.identifier }}
Title: {{ issue.title }}

Body:
{{ issue.description }}`;

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

export type SymphonyLoadedWorkflow = {
  rawConfig: Record<string, unknown>;
  config: SymphonyResolvedWorkflowConfig;
  prompt: string;
  promptTemplate: string;
  sourcePath: string | null;
};

export type SymphonyWorkflowLoadOptions = {
  env?: SymphonyWorkflowEnv;
  cwd?: string;
  tempDir?: string;
};

export class SymphonyWorkflowError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SymphonyWorkflowError";
    this.code = code;
  }
}

export async function loadSymphonyWorkflow(
  workflowPath: string,
  options: SymphonyWorkflowLoadOptions = {}
): Promise<SymphonyLoadedWorkflow> {
  try {
    const content = await readFile(workflowPath, "utf8");
    return parseSymphonyWorkflow(content, {
      ...options,
      sourcePath: path.resolve(workflowPath)
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new SymphonyWorkflowError(
        "missing_workflow_file",
        `Missing workflow file: ${workflowPath}`
      );
    }

    throw error;
  }
}

export function defaultSymphonyWorkflowPath(cwd = process.cwd()): string {
  return path.join(cwd, defaultSymphonyWorkflowFileName);
}

export function parseSymphonyWorkflow(
  content: string,
  options: SymphonyWorkflowLoadOptions & {
    sourcePath?: string | null;
  } = {}
): SymphonyLoadedWorkflow {
  const { frontMatter, promptLines } = splitFrontMatter(content);
  const rawConfig = parseFrontMatter(frontMatter);
  const prompt = promptLines.join("\n").trim();

  return {
    rawConfig,
    config: resolveWorkflowConfig(rawConfig, options),
    prompt,
    promptTemplate:
      prompt === "" ? defaultSymphonyPromptTemplate : prompt,
    sourcePath: options.sourcePath ?? null
  };
}

export function normalizeIssueState(stateName: string | null | undefined): string {
  return typeof stateName === "string" ? stateName.trim().toLowerCase() : "";
}

function splitFrontMatter(content: string): {
  frontMatter: string;
  promptLines: string[];
} {
  const lines = content.split(/\r?\n/u);

  if (lines[0] !== "---") {
    return {
      frontMatter: "",
      promptLines: lines
    };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingIndex === -1) {
    return {
      frontMatter: lines.slice(1).join("\n"),
      promptLines: []
    };
  }

  return {
    frontMatter: lines.slice(1, closingIndex).join("\n"),
    promptLines: lines.slice(closingIndex + 1)
  };
}

function parseFrontMatter(frontMatter: string): Record<string, unknown> {
  if (frontMatter.trim() === "") {
    return {};
  }

  const parsed = parseYaml(frontMatter);
  if (!isRecord(parsed)) {
    throw new SymphonyWorkflowError(
      "workflow_front_matter_not_a_map",
      "Workflow front matter must decode to a map."
    );
  }

  return normalizeObjectKeys(parsed);
}

function resolveWorkflowConfig(
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
      "Closed",
      "Canceled",
      "Duplicate",
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

function normalizeTrackerKind(value: unknown): "linear" | "memory" {
  const normalized = normalizeOptionalString(value);
  if (normalized === null) {
    throw new SymphonyWorkflowError(
      "missing_tracker_kind",
      "tracker.kind is required."
    );
  }

  if (normalized !== "linear" && normalized !== "memory") {
    throw new SymphonyWorkflowError(
      "unsupported_tracker_kind",
      `Unsupported tracker kind: ${normalized}`
    );
  }

  return normalized;
}

function normalizeStateLimits(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, number> = {};
  for (const [stateName, rawLimit] of Object.entries(value)) {
    const normalizedState = normalizeIssueState(stateName);
    if (normalizedState === "") {
      throw new SymphonyWorkflowError(
        "invalid_workflow_config",
        "agent.maxConcurrentAgentsByState state names must not be blank."
      );
    }

    result[normalizedState] = normalizePositiveInteger(
      rawLimit,
      Number.NaN,
      "agent.maxConcurrentAgentsByState"
    );
  }

  return result;
}

function normalizeApprovalPolicy(
  value: unknown
): string | Record<string, unknown> {
  if (value === undefined) {
    return {
      reject: {
        sandbox_approval: true,
        rules: true,
        mcp_elicitations: true
      }
    };
  }

  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value)) {
    return normalizeObjectKeys(value);
  }

  throw new SymphonyWorkflowError(
    "invalid_workflow_config",
    "codex.approvalPolicy must be a string or map."
  );
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeStringArray(
  value: unknown,
  fallback: string[]
): string[] {
  if (value === undefined || value === null) {
    return [...fallback];
  }

  if (!Array.isArray(value)) {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      "Expected an array of strings."
    );
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "string") {
      throw new SymphonyWorkflowError(
        "invalid_workflow_config",
        "Expected an array of strings."
      );
    }

    const trimmed = entry.trim();
    return trimmed === "" ? [] : [trimmed];
  });
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  fieldName: string
): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      `${fieldName} must be a positive integer.`
    );
  }

  return value;
}

function normalizeOptionalPositiveInteger(
  value: unknown,
  fieldName: string
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return normalizePositiveInteger(value, Number.NaN, fieldName);
}

function normalizeNonNegativeInteger(
  value: unknown,
  fallback: number,
  fieldName: string
): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      `${fieldName} must be a non-negative integer.`
    );
  }

  return value;
}

function normalizeOptionalRecord(
  value: unknown
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  return normalizeObjectKeys(value);
}

function getNestedRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? normalizeObjectKeys(value) : {};
}

function resolveEnvToken(
  value: unknown,
  env: SymphonyWorkflowEnv
): unknown {
  if (typeof value !== "string") {
    return value;
  }

  if (!value.startsWith("$")) {
    return value;
  }

  return env[value.slice(1)];
}

function normalizeObjectKeys(value: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeObjectKey(key);
    normalized[normalizedKey] = normalizeNestedValue(nestedValue);
  }

  return normalized;
}

function normalizeNestedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeNestedValue(entry));
  }

  if (isRecord(value)) {
    return normalizeObjectKeys(value);
  }

  return value;
}

function normalizeObjectKey(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase()
  );
}
