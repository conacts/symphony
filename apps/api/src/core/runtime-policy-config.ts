import path from "node:path";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import type { EnvironmentSource } from "./env.js";

const defaultLinearEndpoint = "https://api.linear.app/graphql";
const defaultDispatchableStates = ["Todo", "Bootstrapping", "In Progress", "Rework"];
const defaultTerminalStates = ["Canceled", "Done"];
const defaultClaimTransitionFromStates = ["Todo", "Rework"];
const defaultAllowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

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
    codex: {
      command:
        readOptionalString(environmentSource.SYMPHONY_CODEX_COMMAND) ?? "codex",
      approvalPolicy: "never",
      threadSandbox:
        readOptionalString(environmentSource.SYMPHONY_CODEX_THREAD_SANDBOX) ??
        "danger-full-access",
      turnSandboxPolicy: null,
      turnTimeoutMs: readPositiveInteger(
        environmentSource.SYMPHONY_CODEX_TURN_TIMEOUT_MS,
        3_600_000
      ),
      readTimeoutMs: readPositiveInteger(
        environmentSource.SYMPHONY_CODEX_READ_TIMEOUT_MS,
        5_000
      ),
      stallTimeoutMs: readPositiveInteger(
        environmentSource.SYMPHONY_CODEX_STALL_TIMEOUT_MS,
        300_000
      )
    },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: readPositiveInteger(environmentSource.SYMPHONY_HOOK_TIMEOUT_MS, 60_000)
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
