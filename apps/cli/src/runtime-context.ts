type SymphonyCliCommandContext = {
  runId: string;
  issue: {
    trackerIssueId: string;
    identifier: string;
  };
  turnId: string | null;
  apiBaseUrl: string;
};

export function loadCliCommandContext(
  env: Record<string, string | undefined> = process.env
): SymphonyCliCommandContext {
  return {
    runId: readRequired(env, "SYMPHONY_RUN_ID"),
    issue: readCliIssueContext(env),
    turnId: readOptional(env, "SYMPHONY_TURN_ID"),
    apiBaseUrl: readRequired(env, "SYMPHONY_API_BASE_URL")
  };
}

function readCliIssueContext(env: Record<string, string | undefined>): {
  trackerIssueId: string;
  identifier: string;
} {
  return {
    trackerIssueId: readRequired(env, "SYMPHONY_TRACKER_ISSUE_ID"),
    identifier: readRequired(env, "SYMPHONY_ISSUE_IDENTIFIER")
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
