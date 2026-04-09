import type {
  RuntimeSummaryConnectionState,
  RuntimeSummaryViewModel
} from "@/features/overview/model/overview-view-model";

export {
  buildSymphonyAgentOverflowResult,
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyAgentRunArtifactsDiffDemoResult,
  buildSymphonyForensicsIssueDetailResult,
  buildSymphonyForensicsIssueForensicsBundleResult,
  buildSymphonyForensicsIssueListResult,
  buildSymphonyForensicsProblemRunsResult,
  buildSymphonyForensicsRunDetailResult,
  buildSymphonyForensicsRunDetailDiffDemoResult,
  buildSymphonyForensicsSuccessMetricsResult,
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
