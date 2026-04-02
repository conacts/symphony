import type {
  RuntimeSummaryConnectionState,
  RuntimeSummaryViewModel
} from "@/core/runtime-summary-view-model";

export {
  buildSymphonyForensicsIssueDetailResult,
  buildSymphonyForensicsIssueListResult,
  buildSymphonyForensicsProblemRunsResult,
  buildSymphonyForensicsRunDetailResult,
  buildSymphonyRuntimeStateResult
} from "@symphony/test-support";

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
        detail: "Total Codex runtime reported by the current TypeScript runtime."
      }
    ],
    rateLimitsText: "{\n  \"remaining\": 3\n}",
    runningRows: [
      {
        issueIdentifier: "COL-165",
        state: "In Progress",
        sessionId: "session_123",
        execution: "local / reused / directory / host_path",
        runtimeAndTurns: "2m 0s / 4 turns",
        codexUpdate: "Runtime view updated · 2026-03-31T18:01:00.000Z",
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
    ...overrides
  };
}
