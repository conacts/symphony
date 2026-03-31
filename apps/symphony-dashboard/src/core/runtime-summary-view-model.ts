import type { SymphonyRuntimeStateResult } from "@symphony/contracts";

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
  rateLimitsText: string;
  runningRows: Array<{
    issueIdentifier: string;
    state: string;
    sessionId: string | null;
    runtimeAndTurns: string;
    codexUpdate: string;
    tokenSummary: string;
  }>;
  retryRows: Array<{
    issueIdentifier: string;
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
      label: "Live updates connected",
      detail: "Runtime snapshot and websocket updates are active."
    };
  }

  if (input.status === "degraded") {
    return {
      kind: "degraded",
      label: "Realtime degraded",
      detail:
        input.error ??
        "The dashboard is falling back to the last known runtime snapshot."
    };
  }

  return {
    kind: "waiting",
    label: input.hasSnapshot ? "Connecting realtime" : "Loading runtime snapshot",
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
    rateLimitsText: prettyRateLimits(runtimeSummary.rateLimits),
    runningRows: runtimeSummary.running.map((entry) => ({
      issueIdentifier: entry.issueIdentifier,
      state: entry.state,
      sessionId: entry.sessionId ?? null,
      runtimeAndTurns: formatRuntimeAndTurns(entry.startedAt, entry.turnCount, now),
      codexUpdate: formatCodexUpdate(entry.lastMessage, entry.lastEvent, entry.lastEventAt),
      tokenSummary: `Total ${formatCount(entry.tokens.totalTokens)} · In ${formatCount(entry.tokens.inputTokens)} / Out ${formatCount(entry.tokens.outputTokens)}`
    })),
    retryRows: runtimeSummary.retrying.map((entry) => ({
      issueIdentifier: entry.issueIdentifier,
      attempt: String(entry.attempt),
      dueAt: entry.dueAt ?? "n/a",
      error: entry.error ?? "n/a"
    }))
  };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
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

function formatRuntimeSeconds(secondsRunning: number): string {
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

function prettyRateLimits(rateLimits: Record<string, unknown> | null): string {
  if (!rateLimits) {
    return "No upstream rate-limit snapshot available yet.";
  }

  return JSON.stringify(rateLimits, null, 2);
}

export { formatRuntimeSeconds };
