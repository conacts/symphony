import type { SymphonyForensicsReadModel } from "@symphony/forensics";
import type { SymphonyLoadedPromptContract } from "@symphony/runtime-contract";
import type {
  SymphonyAgentCommandExecutionListResult,
  SymphonyAgentFileChangeListResult,
  SymphonyAgentItemListResult,
  SymphonyAgentMessageListResult,
  SymphonyAgentOverflowResult,
  SymphonyAgentReasoningBlockListResult,
  SymphonyAgentRunArtifactsResult,
  SymphonyAgentRunQuery,
  SymphonyAgentRunTurnQuery,
  SymphonyAgentToolCallListResult,
  SymphonyAgentTurnListResult,
  SymphonyGitHubReviewIngressResult,
  SymphonyGitHubWebhookBody,
  SymphonyGitHubWebhookHeaders,
  SymphonyForensicsIssueTimelineResult,
  SymphonyRuntimeHealthResult,
  SymphonyRuntimeMachineLoadSnapshot,
  SymphonyRuntimeLogsResult,
  SymphonyRuntimeRefreshResult
} from "@symphony/contracts";
import type { SymphonyLogger } from "@symphony/logger";
import type { SymphonyTracker } from "@symphony/tracker";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import type { SymphonyOrchestratorSnapshot } from "@symphony/orchestrator";
import type { SymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";
import type { SymphonyRuntimePollSchedulerSnapshot } from "./poll-scheduler.js";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import type { RuntimeToolExecutionResult } from "@symphony/runtime-tools";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";

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
    repo?: string;
    limit?: number;
  }): Promise<SymphonyForensicsIssueTimelineResult | null>;
};

export type SymphonyRuntimeLogsPort = {
  list(input?: {
    limit?: number;
    repo?: string;
    issueIdentifier?: string;
  }): Promise<SymphonyRuntimeLogsResult>;
};

export type SymphonyRuntimeHealthPort = {
  snapshot(): SymphonyRuntimeHealthResult;
};

export type SymphonyRuntimeToolsPort = {
  recordDeliveryReport(input: {
    runId: string;
    turnId: string | null;
    issue: {
      trackerIssueId: string;
      identifier: string;
      state: string | null;
    };
    argumentsPayload: unknown;
  }): Promise<RuntimeToolExecutionResult>;
  submitSpikeResult(input: {
    runId: string;
    turnId: string | null;
    issue: {
      trackerIssueId: string;
      identifier: string;
      state: string | null;
    };
    argumentsPayload: unknown;
  }): Promise<RuntimeToolExecutionResult>;
  cancelIssue(input: {
    runId: string;
    turnId: string | null;
    issue: {
      trackerIssueId: string;
      identifier: string;
      state: string | null;
    };
    argumentsPayload: unknown;
  }): Promise<RuntimeToolExecutionResult>;
  submitMergeResult(input: {
    runId: string;
    turnId: string | null;
    issue: {
      trackerIssueId: string;
      identifier: string;
      state: string | null;
    };
    argumentsPayload: unknown;
  }): Promise<RuntimeToolExecutionResult>;
};

export type SymphonyAgentAnalyticsReadPort = {
  hasRun(
    runId: SymphonyAgentRunQuery["runId"]
  ): Promise<boolean>;
  fetchRunArtifacts(
    runId: SymphonyAgentRunQuery["runId"]
  ): Promise<SymphonyAgentRunArtifactsResult | null>;
  fetchOverflow(
    runId: SymphonyAgentRunQuery["runId"],
    overflowId: string
  ): Promise<SymphonyAgentOverflowResult | null>;
  listTurns(
    runId: SymphonyAgentRunQuery["runId"]
  ): Promise<SymphonyAgentTurnListResult>;
  listItems(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentItemListResult>;
  listCommandExecutions(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentCommandExecutionListResult>;
  listToolCalls(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentToolCallListResult>;
  listAgentMessages(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentMessageListResult>;
  listReasoning(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentReasoningBlockListResult>;
  listFileChanges(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentFileChangeListResult>;
};

export type SymphonyLoadedRuntimePromptTemplate = {
  prompt: string;
  promptTemplate: string;
  sourcePath: string;
};

export type SymphonyRuntimeAppServices = {
  logger: SymphonyLogger;
  admittedRepositories: AdmittedRuntimeRepository[];
  promptTemplate: SymphonyLoadedRuntimePromptTemplate;
  promptContract: SymphonyLoadedPromptContract;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  tracker: SymphonyTracker;
  orchestrator: SymphonyRuntimeOrchestratorPort;
  agentAnalytics: SymphonyAgentAnalyticsReadPort;
  forensics: SymphonyForensicsReadModel;
  issueTimeline: SymphonyIssueTimelinePort;
  runtimeLogs: SymphonyRuntimeLogsPort;
  health: SymphonyRuntimeHealthPort;
  runtimeTools: SymphonyRuntimeToolsPort;
  routeWorkflows: SymphonyRouteWorkflowPort;
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
  readMachineLoadSnapshot(): SymphonyRuntimeMachineLoadSnapshot | null;
};
