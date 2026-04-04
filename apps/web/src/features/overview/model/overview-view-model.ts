import type { SymphonyRuntimeStateResult } from "@symphony/contracts";
import { formatCount, formatTimestamp } from "@/core/display-formatters";

export type RuntimeSummaryConnectionState = {
  kind: "waiting" | "connected" | "degraded";
  label: string;
  detail: string;
};

export type RuntimeSummaryViewModel = {
  metrics: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  tokenChartRows: Array<{
    issueIdentifier: string;
    inputTokens: number;
    outputTokens: number;
  }>;
  retryChartRows: Array<{
    issueIdentifier: string;
    attempt: number;
  }>;
  rateLimitRows: Array<{
    label: string;
    value: string;
  }>;
  runningRows: Array<{
    issueIdentifier: string;
    state: string;
    sessionId: string | null;
    execution: string;
    runtimeAndTurns: string;
    codexUpdate: string;
    tokenSummary: string;
  }>;
  retryRows: Array<{
    issueIdentifier: string;
    execution: string;
    attempt: string;
    dueAt: string;
    error: string;
  }>;
};

export function buildRuntimeSummaryConnectionState(input: {
  status: "connecting" | "connected" | "degraded";
  error: string | null;
  hasSnapshot: boolean;
}): RuntimeSummaryConnectionState {
  if (input.status === "connected") {
    return {
      kind: "connected",
      label: "connected",
      detail: "Runtime snapshot and websocket updates are active."
    };
  }

  if (input.status === "degraded") {
    return {
      kind: "degraded",
      label: "not connected",
      detail:
        input.error ??
        "The dashboard is falling back to the last known runtime snapshot."
    };
  }

  return {
    kind: "waiting",
    label: "not connected",
    detail: input.hasSnapshot
      ? "Waiting for the runtime websocket acknowledgement."
      : "Fetching the first runtime summary snapshot."
  };
}

export function buildRuntimeSummaryViewModel(
  runtimeSummary: SymphonyRuntimeStateResult,
  now: Date = new Date()
): RuntimeSummaryViewModel {
  return {
    metrics: [
      {
        label: "Running",
        value: formatCount(runtimeSummary.counts.running),
        detail: "Active issue sessions in the current runtime."
      },
      {
        label: "Retrying",
        value: formatCount(runtimeSummary.counts.retrying),
        detail: "Issues waiting for the next retry window."
      },
      {
        label: "Total tokens",
        value: formatCount(runtimeSummary.codexTotals.totalTokens),
        detail: `In ${formatCount(runtimeSummary.codexTotals.inputTokens)} / Out ${formatCount(runtimeSummary.codexTotals.outputTokens)}`
      },
      {
        label: "Runtime",
        value: formatRuntimeSeconds(runtimeSummary.codexTotals.secondsRunning),
        detail: "Total Codex runtime reported by the current TypeScript runtime."
      }
    ],
    tokenChartRows: runtimeSummary.running.map((entry) => ({
      issueIdentifier: entry.issueIdentifier,
      inputTokens: entry.tokens.inputTokens,
      outputTokens: entry.tokens.outputTokens
    })),
    retryChartRows: runtimeSummary.retrying
      .map((entry) => ({
        issueIdentifier: entry.issueIdentifier,
        attempt: entry.attempt
      }))
      .sort((left, right) => right.attempt - left.attempt),
    rateLimitRows: buildRateLimitRows(runtimeSummary.rateLimits),
    runningRows: runtimeSummary.running.map((entry) => ({
      issueIdentifier: entry.issueIdentifier,
      state: entry.state,
      sessionId: entry.sessionId ?? null,
      execution: formatExecution(entry.workspace, entry.launchTarget),
      runtimeAndTurns: formatRuntimeAndTurns(entry.startedAt, entry.turnCount, now),
      codexUpdate: formatCodexUpdate(
        entry.lastMessage,
        entry.lastEvent,
        entry.lastEventAt
      ),
      tokenSummary: `Total ${formatCount(entry.tokens.totalTokens)} · In ${formatCount(entry.tokens.inputTokens)} / Out ${formatCount(entry.tokens.outputTokens)}`
    })),
    retryRows: runtimeSummary.retrying.map((entry) => ({
      issueIdentifier: entry.issueIdentifier,
      execution: formatExecution(entry.workspace, entry.launchTarget),
      attempt: String(entry.attempt),
      dueAt: formatTimestamp(entry.dueAt),
      error: entry.error ?? "n/a"
    }))
  };
}

export function formatRuntimeSeconds(secondsRunning: number): string {
  const totalSeconds = Math.max(0, Math.floor(secondsRunning));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatRuntimeAndTurns(
  startedAt: string | null,
  turnCount: number,
  now: Date
): string {
  if (!startedAt) {
    return `${turnCount} turns`;
  }

  const runtimeSeconds = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(startedAt)) / 1_000)
  );

  return `${formatRuntimeSeconds(runtimeSeconds)} / ${turnCount} turns`;
}

function formatCodexUpdate(
  lastMessage: string | null | undefined,
  lastEvent: string | null | undefined,
  lastEventAt: string | null | undefined
): string {
  const message = lastMessage ?? lastEvent ?? "n/a";

  if (!lastEventAt) {
    return message;
  }

  return `${message} · ${lastEventAt}`;
}

function buildRateLimitRows(
  rateLimits: Record<string, unknown> | null
): Array<{
  label: string;
  value: string;
}> {
  if (!rateLimits) {
    return [
      {
        label: "Status",
        value: "No upstream rate-limit snapshot available yet."
      }
    ];
  }

  return Object.entries(rateLimits).map(([label, value]) => ({
    label,
    value: formatUnknownValue(value)
  }));
}

function formatExecution(
  workspace: SymphonyRuntimeStateResult["running"][number]["workspace"] | null,
  launchTarget:
    | SymphonyRuntimeStateResult["running"][number]["launchTarget"]
    | SymphonyRuntimeStateResult["retrying"][number]["launchTarget"]
    | null
): string {
  if (!workspace && !launchTarget) {
    return "n/a";
  }

  const parts = [
    workspace?.backendKind ?? null,
    workspace?.prepareDisposition ?? null,
    workspace?.materializationKind ?? null,
    launchTarget?.kind ?? workspace?.executionTargetKind ?? null,
    workspace?.containerName ?? null
  ].filter((part): part is string => Boolean(part));

  return parts.join(" / ");
}

function formatUnknownValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}
