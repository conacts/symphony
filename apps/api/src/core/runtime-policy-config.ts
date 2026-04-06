import path from "node:path";
import type {
  SymphonyResolvedRuntimePolicy
} from "@symphony/runtime-policy";
import type { EnvironmentSource } from "./env.js";

type SymphonyPiRuntimePolicy = {
  profile: string | null;
  defaultModel: string | null;
  defaultReasoningEffort: string | null;
  provider: SymphonyResolvedRuntimePolicy["pi"]["provider"];
  turnTimeoutMs: number;
  readTimeoutMs: number;
  stallTimeoutMs: number;
};

const defaultLinearEndpoint = "https://api.linear.app/graphql";
const defaultDispatchableStates = ["Todo", "Bootstrapping", "In Progress", "Rework"];
const defaultTerminalStates = ["Canceled", "Done"];
const defaultClaimTransitionFromStates = ["Todo", "Rework"];
const defaultAllowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
function createOpenRouterProfile(profile: string, defaultModel: string) {
  return {
    profile,
    defaultModel,
    defaultReasoningEffort: "high",
    provider: {
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      envKey: "OPENROUTER_API_KEY",
      supportsWebsockets: false,
      wireApi: "responses"
    }
  } as const;
}

const mimoV2ProProfile = createOpenRouterProfile("mimo-v2-pro", "xiaomi/mimo-v2-pro");
const glm5TurboProfile = createOpenRouterProfile("glm-5-turbo", "z-ai/glm-5-turbo");
const defaultOpenRouterProfile = mimoV2ProProfile;

export function loadSymphonyRuntimePolicyConfig(input: {
  environmentSource: EnvironmentSource;
  cwd?: string;
}): SymphonyResolvedRuntimePolicy {
  const environmentSource = input.environmentSource;
  const cwd = input.cwd ?? process.cwd();
  const workspaceRoot =
    readOptionalString(environmentSource.SYMPHONY_WORKSPACE_ROOT) ??
    path.join(cwd, ".symphony", "workspaces");
  const githubStatePath =
    readOptionalString(environmentSource.SYMPHONY_GITHUB_STATE_PATH) ??
    path.join(workspaceRoot, ".symphony", "github-state.json");
  const trackerKind = readOptionalString(environmentSource.SYMPHONY_TRACKER_KIND) ?? "linear";
  const piProfile = readOptionalString(environmentSource.SYMPHONY_PI_PROFILE);
  const piProfileDefaults = resolvePiProfileDefaults(piProfile);
  const trackerProjectSlug = readOptionalString(
    environmentSource.SYMPHONY_LINEAR_PROJECT_SLUG
  );
  const trackerTeamKey = readOptionalString(environmentSource.SYMPHONY_LINEAR_TEAM_KEY);

  if (trackerKind === "linear" && !trackerProjectSlug && !trackerTeamKey) {
    throw new TypeError(
      "Invalid Symphony runtime policy: set SYMPHONY_LINEAR_PROJECT_SLUG or SYMPHONY_LINEAR_TEAM_KEY."
    );
  }

  return {
    tracker: {
      kind: trackerKind === "memory" ? "memory" : "linear",
      endpoint:
        readOptionalString(environmentSource.SYMPHONY_LINEAR_ENDPOINT) ??
        defaultLinearEndpoint,
      apiKey:
        trackerKind === "memory"
          ? null
          : readOptionalString(environmentSource.LINEAR_API_KEY),
      projectSlug: trackerKind === "memory" ? null : trackerProjectSlug,
      teamKey: trackerKind === "memory" ? null : trackerTeamKey,
      excludedProjectIds:
        readStringList(environmentSource.SYMPHONY_LINEAR_EXCLUDED_PROJECT_IDS) ?? [],
      assignee: readOptionalString(environmentSource.SYMPHONY_LINEAR_ASSIGNEE),
      dispatchableStates:
        readStringList(environmentSource.SYMPHONY_DISPATCHABLE_STATES) ??
        defaultDispatchableStates,
      terminalStates:
        readStringList(environmentSource.SYMPHONY_TERMINAL_STATES) ??
        defaultTerminalStates,
      claimTransitionToState:
        readOptionalString(environmentSource.SYMPHONY_CLAIM_TRANSITION_TO_STATE) ??
        "Bootstrapping",
      claimTransitionFromStates:
        readStringList(environmentSource.SYMPHONY_CLAIM_TRANSITION_FROM_STATES) ??
        defaultClaimTransitionFromStates,
      startupFailureTransitionToState:
        readOptionalString(environmentSource.SYMPHONY_STARTUP_FAILURE_STATE) ?? "Failed",
      pauseTransitionToState:
        readOptionalString(environmentSource.SYMPHONY_PAUSE_STATE) ?? "Paused"
    },
    polling: {
      intervalMs: readPositiveInteger(environmentSource.SYMPHONY_POLL_INTERVAL_MS, 5_000)
    },
    workspace: {
      root: workspaceRoot
    },
    worker: {
      sshHosts: [],
      maxConcurrentAgentsPerHost: null
    },
    agent: {
      harness: "pi",
      maxConcurrentAgents: readPositiveInteger(
        environmentSource.SYMPHONY_AGENT_MAX_CONCURRENT,
        10
      ),
      maxTurns: readPositiveInteger(environmentSource.SYMPHONY_AGENT_MAX_TURNS, 20),
      maxRetryBackoffMs: readPositiveInteger(
        environmentSource.SYMPHONY_AGENT_MAX_RETRY_BACKOFF_MS,
        300_000
      ),
      maxConcurrentAgentsByState: {}
    },
    pi: readPiPolicy({
      environmentSource,
      profile: piProfile,
      profileDefaults: piProfileDefaults
    }),
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
      readTimeoutMs: 120_000,
      stallTimeoutMs: 300_000
    },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: readPositiveInteger(environmentSource.SYMPHONY_HOOK_TIMEOUT_MS, 150_000)
    },
    observability: {
      dashboardEnabled: false,
      refreshMs: 1_000,
      renderIntervalMs: 16
    },
    server: {
      port: null,
      host: readOptionalString(environmentSource.SYMPHONY_SERVER_HOST) ?? "0.0.0.0"
    },
    github: {
      repo:
        readOptionalString(environmentSource.SYMPHONY_GITHUB_REPOSITORY) ??
        readOptionalString(environmentSource.GITHUB_REPOSITORY),
      webhookSecret: readOptionalString(environmentSource.SYMPHONY_GITHUB_WEBHOOK_SECRET),
      apiToken:
        readOptionalString(environmentSource.SYMPHONY_GITHUB_API_TOKEN) ??
        readOptionalString(environmentSource.GITHUB_TOKEN),
      statePath: githubStatePath,
      allowedReviewLogins:
        readStringList(environmentSource.SYMPHONY_GITHUB_ALLOWED_REVIEW_LOGINS) ?? [],
      allowedReworkCommentLogins:
        readStringList(environmentSource.SYMPHONY_GITHUB_ALLOWED_REWORK_LOGINS) ?? []
    }
  };
}
export function defaultSymphonyAllowedOrigins(): string[] {
  return [...defaultAllowedOrigins];
}

function readOptionalString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new TypeError(
      `Invalid Symphony runtime policy: expected a positive integer, received ${JSON.stringify(value)}.`
    );
  }

  return normalized;
}

function readStringList(value: string | undefined): string[] | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : null;
}

function readOptionalBoolean(value: string | undefined): boolean | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") {
    return null;
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  throw new TypeError(
    `Invalid Symphony runtime policy: expected a boolean, received ${JSON.stringify(value)}.`
  );
}

function readPiPolicy(input: {
  environmentSource: EnvironmentSource;
  profile: string | null;
  profileDefaults: ReturnType<typeof resolvePiProfileDefaults>;
}): SymphonyPiRuntimePolicy {
  const { environmentSource, profile, profileDefaults } = input;

  return {
    profile: profileDefaults?.profile ?? profile,
    defaultModel:
      readOptionalString(environmentSource.SYMPHONY_PI_MODEL) ??
      profileDefaults?.defaultModel ??
      defaultOpenRouterProfile.defaultModel,
    defaultReasoningEffort:
      readOptionalString(environmentSource.SYMPHONY_PI_REASONING_EFFORT) ??
      profileDefaults?.defaultReasoningEffort ??
      defaultOpenRouterProfile.defaultReasoningEffort,
    provider: {
      id:
        readOptionalString(environmentSource.SYMPHONY_PI_PROVIDER) ??
        profileDefaults?.provider.id ??
        defaultOpenRouterProfile.provider.id,
      name:
        readOptionalString(environmentSource.SYMPHONY_PI_PROVIDER_NAME) ??
        profileDefaults?.provider.name ??
        defaultOpenRouterProfile.provider.name,
      baseUrl:
        readOptionalString(environmentSource.SYMPHONY_PI_PROVIDER_BASE_URL) ??
        profileDefaults?.provider.baseUrl ??
        defaultOpenRouterProfile.provider.baseUrl,
      envKey:
        readOptionalString(environmentSource.SYMPHONY_PI_PROVIDER_ENV_KEY) ??
        profileDefaults?.provider.envKey ??
        defaultOpenRouterProfile.provider.envKey,
      supportsWebsockets:
        readOptionalBoolean(environmentSource.SYMPHONY_PI_PROVIDER_SUPPORTS_WEBSOCKETS) ??
        profileDefaults?.provider.supportsWebsockets ??
        defaultOpenRouterProfile.provider.supportsWebsockets,
      wireApi:
        readOptionalString(environmentSource.SYMPHONY_PI_PROVIDER_WIRE_API) ??
        profileDefaults?.provider.wireApi ??
        defaultOpenRouterProfile.provider.wireApi
    },
    turnTimeoutMs: readPositiveInteger(
      environmentSource.SYMPHONY_PI_TURN_TIMEOUT_MS,
      3_600_000
    ),
    readTimeoutMs: readPositiveInteger(
      environmentSource.SYMPHONY_PI_READ_TIMEOUT_MS,
      5_000
    ),
    stallTimeoutMs: readPositiveInteger(
      environmentSource.SYMPHONY_PI_STALL_TIMEOUT_MS,
      300_000
    )
  };
}

function resolvePiProfileDefaults(
  profile: string | null
): typeof glm5TurboProfile | typeof mimoV2ProProfile | null {
  if (profile === null) {
    return defaultOpenRouterProfile;
  }

  switch (profile.trim().toLowerCase()) {
    case mimoV2ProProfile.profile:
      return mimoV2ProProfile;
    case glm5TurboProfile.profile:
      return glm5TurboProfile;
    default:
      return null;
  }
}
