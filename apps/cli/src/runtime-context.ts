import {
  createSymphonyIssueTimelineStore,
  createSymphonyIssueDeliveryReportStore,
  defaultSymphonyDbFile,
  initializeSymphonyDb,
  type SymphonyDb,
  type SymphonyIssueDeliveryReportStore
} from "@symphony/db";
import {
  createLinearSymphonyTracker,
  type SymphonyTracker,
  type SymphonyTrackerConfig
} from "@symphony/tracker";

const defaultLinearEndpoint = "https://api.linear.app/graphql";

type SymphonyCliRuntimeContext = {
  db: SymphonyDb;
  deliveryReports: SymphonyIssueDeliveryReportStore;
  issueTimelineStore: ReturnType<typeof createSymphonyIssueTimelineStore>;
  repositoryKey: string;
  tracker: SymphonyTracker;
  trackerConfig: SymphonyTrackerConfig;
  runId: string;
  issue: {
    trackerIssueId: string;
    identifier: string;
    state: string | null;
  };
  turnId: string | null;
};

type SymphonyCliCommandContext = {
  runId: string;
  issue: {
    trackerIssueId: string;
    identifier: string;
    state: string | null;
  };
  turnId: string | null;
  apiBaseUrl: string | null;
};

export function loadCliCommandContext(
  env: Record<string, string | undefined> = process.env
): SymphonyCliCommandContext {
  return {
    runId: readRequired(env, "SYMPHONY_RUN_ID"),
    issue: readCliIssueContext(env),
    turnId: readOptional(env, "SYMPHONY_TURN_ID"),
    apiBaseUrl: readOptional(env, "SYMPHONY_API_BASE_URL")
  };
}

export function loadCliRuntimeContext(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd()
): SymphonyCliRuntimeContext {
  const trackerConfig = buildCliTrackerConfig(env);

  const db = initializeSymphonyDb({
    dbFile: readOptional(env, "SYMPHONY_DB_FILE") ?? defaultSymphonyDbFile(cwd)
  });
  const repositoryKey = readRequired(env, "SYMPHONY_REPOSITORY_KEY");

  return {
    db,
    deliveryReports: createSymphonyIssueDeliveryReportStore({
      db: db.db,
      repositoryKey
    }),
    issueTimelineStore: createSymphonyIssueTimelineStore(db.db, {
      repositoryKey
    }),
    repositoryKey,
    tracker: createLinearSymphonyTracker({
      config: trackerConfig
    }),
    trackerConfig,
    runId: readRequired(env, "SYMPHONY_RUN_ID"),
    issue: readCliIssueContext(env),
    turnId: readOptional(env, "SYMPHONY_TURN_ID")
  };
}

function buildCliTrackerConfig(
  env: Record<string, string | undefined>
): SymphonyTrackerConfig {
  const trackerKind = readOptional(env, "SYMPHONY_TRACKER_KIND") ?? "linear";

  if (trackerKind !== "linear") {
    throw new TypeError(
      `Unsupported Symphony CLI tracker kind: ${JSON.stringify(trackerKind)}.`
    );
  }

  return {
    kind: "linear",
    endpoint: readOptional(env, "SYMPHONY_LINEAR_ENDPOINT") ?? defaultLinearEndpoint,
    apiKey: readRequired(env, "LINEAR_API_KEY"),
    teamKey: readRequired(env, "SYMPHONY_LINEAR_TEAM_KEY"),
    excludedProjectIds: readList(env, "SYMPHONY_LINEAR_EXCLUDED_PROJECT_IDS"),
    assignee: readOptional(env, "SYMPHONY_LINEAR_ASSIGNEE"),
    dispatchableStates: readList(env, "SYMPHONY_DISPATCHABLE_STATES", [
      "Todo",
      "Bootstrapping",
      "In Progress",
      "Rework",
      "Approved"
    ]),
    terminalStates: readList(env, "SYMPHONY_TERMINAL_STATES", ["Canceled", "Done"]),
    claimTransitionToState:
      readOptional(env, "SYMPHONY_CLAIM_TRANSITION_TO_STATE") ?? "Bootstrapping",
    claimTransitionFromStates: readList(env, "SYMPHONY_CLAIM_TRANSITION_FROM_STATES", [
      "Todo",
      "Rework"
    ]),
    startupFailureTransitionToState:
      readOptional(env, "SYMPHONY_STARTUP_FAILURE_STATE") ?? "Failed",
    pauseTransitionToState: readOptional(env, "SYMPHONY_PAUSE_STATE") ?? "Paused",
    blockedTransitionToState: readOptional(env, "SYMPHONY_BLOCKED_STATE") ?? "Blocked"
  };
}

function readCliIssueContext(env: Record<string, string | undefined>): {
  trackerIssueId: string;
  identifier: string;
  state: string | null;
} {
  return {
    trackerIssueId: readRequired(env, "SYMPHONY_TRACKER_ISSUE_ID"),
    identifier: readRequired(env, "SYMPHONY_ISSUE_IDENTIFIER"),
    state: readOptional(env, "SYMPHONY_ISSUE_STATE")
  };
}

function readRequired(
  env: Record<string, string | undefined>,
  key: string
): string {
  const value = readOptional(env, key);
  if (!value) {
    throw new TypeError(`Missing required Symphony CLI environment variable: ${key}.`);
  }

  return value;
}

function readOptional(
  env: Record<string, string | undefined>,
  key: string
): string | null {
  const value = env[key];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readList(
  env: Record<string, string | undefined>,
  key: string,
  fallback: string[] = []
): string[] {
  const value = readOptional(env, key);
  if (!value) {
    return [...fallback];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
