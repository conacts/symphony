export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);
}

export function formatDuration(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDurationMilliseconds(value: number | null): string {
  if (value === null || value <= 0) {
    return "0ms";
  }

  if (value < 1_000) {
    return `${Math.round(value)}ms`;
  }

  if (value < 60_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}s`;
  }

  return formatDuration(value / 1_000);
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

export function prettyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return JSON.stringify(value, null, 2);
}

const labelOverrides = new Map<string, string>([
  ["n/a", "n/a"],
  ["api_key_env", "Provider API key"],
  ["auth_json", "OpenAI auth.json"],
  ["run_stopped_terminal", "Stopped by operator"],
  ["run_stopped_inactive", "Stopped after inactivity"],
  ["startup_failed", "Startup failed"],
  ["startup_failed_backlog", "Startup failed in backlog"],
  ["max_turns", "Max turns reached"],
  ["max_turns_reached", "Max turns reached"],
  ["paused_max_turns", "Paused at max turns"],
  ["paused_provider_transient", "Paused after provider retries"],
  ["provider_transient", "Transient provider failure"],
  ["rate_limited", "Rate limited"],
  ["many_retries", "Many retries"],
  ["ready", "Ready"],
  ["down", "Down"],
  ["in_progress", "In progress"],
  ["codex_runtime", "Codex runtime"],
  ["workspace_boot_failure", "Workspace boot failure"],
  ["rate_limit_exceeded", "Rate limit exceeded"],
  ["agent_message", "Agent message"],
  ["mcp_tool_call", "Tool call"],
  ["file_change", "File change"],
  ["web_search", "Web search"],
  ["todo_list", "Todo list"],
  ["thread.started", "Thread started"],
  ["turn.started", "Turn started"],
  ["turn.completed", "Turn completed"],
  ["turn.failed", "Turn failed"],
  ["item.started", "Item started"],
  ["item.updated", "Item updated"],
  ["item.completed", "Item completed"],
  ["runtime_session_started", "Runtime session started"],
  ["runtime_execution_failed", "Runtime execution failed"],
  ["runtime_startup_failed", "Runtime startup failed"],
  ["run_finalized", "Run finalized"],
  ["OPENROUTER_API_KEY", "OpenRouter API key"]
]);

export function formatLabel(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  const override = labelOverrides.get(value);
  if (override) {
    return override;
  }

  if (value.includes("/")) {
    return value;
  }

  const normalized = value
    .replace(/[:._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => {
      const upper = part.toUpperCase();

      if (upper === "API") {
        return "API";
      }

      if (upper === "PR") {
        return "PR";
      }

      if (upper === "MCP") {
        return "MCP";
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");

  return normalized === "" ? value : normalized;
}

export function formatOutcomeLabel(value: string | null | undefined): string {
  return formatLabel(value);
}

export function formatStatusLabel(value: string | null | undefined): string {
  return formatLabel(value);
}

export function formatErrorClassLabel(value: string | null | undefined): string {
  return formatLabel(value);
}

export function formatEventTypeLabel(value: string | null | undefined): string {
  return formatLabel(value);
}

export function formatSourceLabel(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  return value
    .split(":")
    .map((segment) => formatLabel(segment))
    .join(" / ");
}

export function formatAuthModeLabel(value: string | null | undefined): string {
  return formatLabel(value);
}

export function formatFlagLabel(value: string | null | undefined): string {
  return formatLabel(value);
}

export function formatProviderEnvKeyLabel(
  value: string | null | undefined
): string {
  return formatLabel(value);
}
