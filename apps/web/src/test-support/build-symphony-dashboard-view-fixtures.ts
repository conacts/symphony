import type {
  RuntimeSummaryConnectionState,
  RuntimeSummaryViewModel
} from "@/features/overview/model/overview-view-model";

export {
  buildSymphonyAgentOverflowResult,
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsIssueDetailResult,
  buildSymphonyForensicsIssueForensicsBundleResult,
  buildSymphonyForensicsIssueListResult,
  buildSymphonyForensicsProblemRunsResult,
  buildSymphonyForensicsRunDetailResult,
  buildSymphonyRuntimeHealthResult,
  buildSymphonyRuntimeLogsResult,
  buildSymphonyRuntimeStateResult
} from "./symphony-runtime-builders";

export function buildSymphonyDashboardConnectionState(
  overrides: Partial<RuntimeSummaryConnectionState> = {}
): RuntimeSummaryConnectionState {
  return {
    kind: "connected",
    label: "connected",
    detail: "Runtime snapshot and websocket updates are active.",
    ...overrides
  };
}

export function buildSymphonyRuntimeSummaryViewModel(
  overrides: Partial<RuntimeSummaryViewModel> = {}
): RuntimeSummaryViewModel {
  return {
    metrics: [
      {
        label: "Running",
        value: "1",
        detail: "Active issue sessions in the current runtime."
      },
      {
        label: "Retrying",
        value: "1",
        detail: "Issues waiting for the next retry window."
      },
      {
        label: "Total tokens",
        value: "320",
        detail: "In 200 / Out 120"
      },
      {
        label: "Runtime",
        value: "1m 35s",
        detail: "Total agent runtime reported by the current TypeScript runtime."
      }
    ],
    tokenChartRows: [
      {
        issueIdentifier: "COL-165",
        inputTokens: 120,
        outputTokens: 80
      }
    ],
    retryChartRows: [
      {
        issueIdentifier: "COL-166",
        attempt: 2
      }
    ],
    rateLimitRows: [
      {
        label: "remaining",
        value: "3"
      }
    ],
    runningRows: [
      {
        issueIdentifier: "COL-165",
        state: "In Progress",
        sessionId: "session_123",
        execution: "docker / reused / bind_mount / container / symphony-col-165",
        runtimeAndTurns: "2m 0s / 4 turns",
        agentUpdate: "Runtime view updated · 2026-03-31T18:01:00.000Z",
        tokenSummary: "Total 200 · In 120 / Out 80"
      }
    ],
    retryRows: [
      {
        issueIdentifier: "COL-166",
        execution: "docker / reused / bind_mount / container / symphony-col-166",
        attempt: "2",
        dueAt: "2026-03-31T18:05:00.000Z",
        error: "Worker disconnected"
      }
    ],
    piTelemetryCards: [
      {
        label: "Sampled PI runs",
        value: "1",
        detail: "1 issues currently contribute PI artifact telemetry to the dashboard sample."
      },
      {
        label: "Tool calls",
        value: "1",
        detail: "1 commands observed across the sampled runs."
      },
      {
        label: "Reasoning",
        value: "1",
        detail: "2 file changes were recorded in the same sampled runs."
      },
      {
        label: "Overflow + task signals",
        value: "1",
        detail: "1 overflow payloads and 0 task snapshots are currently available."
      }
    ],
    ...overrides
  };
}
