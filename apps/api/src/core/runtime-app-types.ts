import type { SymphonyForensicsReadModel } from "@symphony/forensics";
import type { SymphonyLoadedPromptContract } from "@symphony/runtime-contract";
import type {
  SymphonyCodexAgentMessageListResult,
  SymphonyCodexCommandExecutionListResult,
  SymphonyCodexFileChangeListResult,
  SymphonyCodexItemListResult,
  SymphonyCodexOverflowResult,
  SymphonyCodexReasoningListResult,
  SymphonyCodexRunArtifactsResult,
  SymphonyCodexRunQuery,
  SymphonyCodexRunTurnQuery,
  SymphonyCodexToolCallListResult,
  SymphonyCodexTurnListResult,
  SymphonyGitHubReviewIngressResult,
  SymphonyGitHubWebhookBody,
  SymphonyGitHubWebhookHeaders,
  SymphonyForensicsIssueTimelineResult,
  SymphonyRuntimeHealthResult,
  SymphonyRuntimeLogsResult,
  SymphonyRuntimeRefreshResult
} from "@symphony/contracts";
import type { SymphonyLogger } from "@symphony/logger";
import type { SymphonyTracker } from "@symphony/tracker";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import type { SymphonyOrchestratorSnapshot } from "@symphony/orchestrator";
import type { SymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";
import type { SymphonyRuntimePollSchedulerSnapshot } from "./poll-scheduler.js";

export type SymphonyRuntimeOrchestratorPort = {
  snapshot(): SymphonyOrchestratorSnapshot;
  runPollCycle(): Promise<SymphonyOrchestratorSnapshot>;
  isPollCycleInFlight(): boolean;
  requestRefresh(): Promise<SymphonyRuntimeRefreshResult>;
};

export type SymphonyGitHubReviewIngressPort = {
  ingest(input: {
    headers: SymphonyGitHubWebhookHeaders;
    body: SymphonyGitHubWebhookBody;
    rawBody: string;
  }): Promise<SymphonyGitHubReviewIngressResult>;
};

export type SymphonyIssueTimelinePort = {
  list(input: {
    issueIdentifier: string;
    limit?: number;
  }): Promise<SymphonyForensicsIssueTimelineResult | null>;
};

export type SymphonyRuntimeLogsPort = {
  list(input?: {
    limit?: number;
    issueIdentifier?: string;
  }): Promise<SymphonyRuntimeLogsResult>;
};

export type SymphonyRuntimeHealthPort = {
  snapshot(): SymphonyRuntimeHealthResult;
};

export type SymphonyCodexAnalyticsReadPort = {
  fetchRunArtifacts(
    runId: SymphonyCodexRunQuery["runId"]
  ): Promise<SymphonyCodexRunArtifactsResult | null>;
  fetchOverflow(
    runId: SymphonyCodexRunQuery["runId"],
    overflowId: string
  ): Promise<SymphonyCodexOverflowResult | null>;
  listTurns(
    runId: SymphonyCodexRunQuery["runId"]
  ): Promise<SymphonyCodexTurnListResult>;
  listItems(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexItemListResult>;
  listCommandExecutions(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexCommandExecutionListResult>;
  listToolCalls(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexToolCallListResult>;
  listAgentMessages(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexAgentMessageListResult>;
  listReasoning(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexReasoningListResult>;
  listFileChanges(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexFileChangeListResult>;
};

export type SymphonyLoadedRuntimePromptTemplate = {
  prompt: string;
  promptTemplate: string;
  sourcePath: string;
};

export type SymphonyRuntimeAppServices = {
  logger: SymphonyLogger;
  promptTemplate: SymphonyLoadedRuntimePromptTemplate;
  promptContract: SymphonyLoadedPromptContract;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  tracker: SymphonyTracker;
  orchestrator: SymphonyRuntimeOrchestratorPort;
  codexAnalytics: SymphonyCodexAnalyticsReadPort;
  forensics: SymphonyForensicsReadModel;
  issueTimeline: SymphonyIssueTimelinePort;
  runtimeLogs: SymphonyRuntimeLogsPort;
  health: SymphonyRuntimeHealthPort;
  githubReviewIngress: SymphonyGitHubReviewIngressPort;
  realtime: SymphonyRealtimeHub;
  shutdown(): Promise<void>;
};

export type RuntimeHealthPortInput = {
  dbFile: string;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  readPollSchedulerSnapshot():
    | SymphonyRuntimePollSchedulerSnapshot
    | null;
};
