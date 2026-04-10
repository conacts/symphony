import type {
  AgentRuntimeLaunchTarget
} from "./agent-runtime.js";
import type { JsonObject } from "@symphony/contracts";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type {
  PreparedWorkspace,
  WorkspaceManifestLifecyclePhase
} from "@symphony/workspace";

export type SymphonyAgentMessage = {
  event: string;
  message: unknown;
  timestamp: string;
};

export type SymphonyAgentTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  secondsRunning: number;
};

export type SymphonyStartupFailureStage =
  | "workspace_prepare"
  | "workspace_before_run"
  | "runtime_launch"
  | "runtime_session_start";

export type SymphonyStartupFailureOrigin =
  | "workspace_lifecycle"
  | "docker_lifecycle"
  | "repo_env_contract"
  | "image_tooling_contract"
  | "docker_backend_contract"
  | "pi_auth_contract"
  | "runtime_launch"
  | "pi_startup";

export type SymphonyRunningEntry = {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  runMode: SymphonyRunMode;
  threadId: string | null;
  workerHost: string | null;
  workspace: PreparedWorkspace | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
  workspacePath: string | null;
  retryAttempt: number;
  turnCount: number;
  lastAgentMessage: SymphonyAgentMessage | null;
  lastAgentTimestamp: string | null;
  lastAgentEvent: string | null;
  agentInputTokens: number;
  agentOutputTokens: number;
  agentTotalTokens: number;
  agentLastReportedInputTokens: number;
  agentLastReportedOutputTokens: number;
  agentLastReportedTotalTokens: number;
  lastRateLimits: JsonObject | null;
  agentRuntimeProcessId: string | null;
  startedAt: string;
};

export type SymphonyDispatchPhase =
  | "claim"
  | "workspace_prepare"
  | "workspace_before_run"
  | "runtime_launch";

export type SymphonyDispatchStopReason =
  | "inactive"
  | "terminal";

export type SymphonyDispatchStopRequest = {
  reason: SymphonyDispatchStopReason;
  issue: SymphonyTrackerIssue;
};

export type SymphonyDispatchingEntry = {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  runMode: SymphonyRunMode;
  workerHost: string | null;
  workspace: PreparedWorkspace | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
  attempt: number;
  startedAt: string;
  phase: SymphonyDispatchPhase;
  runtimeStarted: boolean;
  stopRequest: SymphonyDispatchStopRequest | null;
  shutdownDrainCompleted: boolean;
};

export type SymphonyDispatchBootstrapRoutingInput = {
  issue: SymphonyTrackerIssue;
  attempt: number;
  preferredWorkerHost: string | null;
  startedAt: string;
};

export type SymphonyDispatchBootstrapRoutingResult = {
  issue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode;
};

export interface SymphonyDispatchBootstrapRouter {
  route(
    input: SymphonyDispatchBootstrapRoutingInput
  ):
    | Promise<SymphonyDispatchBootstrapRoutingResult>
    | SymphonyDispatchBootstrapRoutingResult;
}

export type SymphonyRunStartActivationInput = {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  runMode: SymphonyRunMode;
  threadId: string | null;
  workerHost: string | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
  recordedAt: string;
};

export type SymphonyRunStartActivationResult = {
  issue: SymphonyTrackerIssue;
};

export interface SymphonyRunStartActivationRouter {
  activate(
    input: SymphonyRunStartActivationInput
  ):
    | Promise<SymphonyRunStartActivationResult>
    | SymphonyRunStartActivationResult;
}

export type SymphonyRunLifecycleObservationInput = {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  runMode: SymphonyRunMode;
  recordedAt: string;
};

export type SymphonyRunLifecycleObservationResult = {
  issue: SymphonyTrackerIssue;
};

export type SymphonyRunLifecycleCompletionInput = {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  runMode: SymphonyRunMode;
  completion: SymphonyAgentRuntimeCompletion;
  recordedAt: string;
};

export type SymphonyRunLifecycleCompletionResult = {
  issue: SymphonyTrackerIssue;
};

export interface SymphonyRunLifecycleRouter {
  observeIssueState(
    input: SymphonyRunLifecycleObservationInput
  ):
    | Promise<SymphonyRunLifecycleObservationResult>
    | SymphonyRunLifecycleObservationResult;
  routeCompletion(
    input: SymphonyRunLifecycleCompletionInput
  ):
    | Promise<SymphonyRunLifecycleCompletionResult>
    | SymphonyRunLifecycleCompletionResult;
}

export type SymphonyRetryEntry = {
  attempt: number;
  dueAtMs: number;
  retryToken: string;
  identifier: string;
  runMode: SymphonyRunMode;
  error: string | null;
  workerHost: string | null;
  workspace: PreparedWorkspace | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
  workspacePath: string | null;
  delayType: "continuation" | "failure";
};

export type SymphonyOrchestratorState = {
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  nextPollDueAtMs: number | null;
  pollCheckInProgress: boolean;
  dispatching: Record<string, SymphonyDispatchingEntry>;
  running: Record<string, SymphonyRunningEntry>;
  completed: Set<string>;
  claimed: Set<string>;
  retryAttempts: Record<string, SymphonyRetryEntry>;
  agentTotals: SymphonyAgentTotals;
  rateLimits: JsonObject | null;
};

export type SymphonyAgentRuntimeCompletion =
  | { kind: "delivered" }
  | { kind: "merged" }
  | { kind: "blocked"; reason: string }
  | { kind: "merge_blocked"; reason: string }
  | { kind: "max_turns_reached"; reason: string; maxTurns: number }
  | {
      kind: "startup_failure";
      reason: string;
      failureStage: SymphonyStartupFailureStage;
      failureOrigin: SymphonyStartupFailureOrigin;
      launchTarget?: AgentRuntimeLaunchTarget | null;
      manifestLifecyclePhase?: WorkspaceManifestLifecyclePhase | null;
      manifestLifecycleStepName?: string | null;
      manifestLifecycle?: JsonObject | null;
    }
  | { kind: "rate_limited"; reason: string }
  | { kind: "provider_transient"; reason: string }
  | { kind: "stalled"; reason: string }
  | { kind: "failure"; reason: string };

export type SymphonyAgentRuntimeUpdate = {
  event: string;
  payload?: unknown;
  timestamp: string;
  threadId?: string | null;
  agentRuntimeProcessId?: string | null;
};

export interface SymphonyOrchestratorObserver {
  startRun(input: {
    issue: SymphonyTrackerIssue;
    attempt: number;
    runMode: SymphonyRunMode;
    harness: "pi";
    workspace: PreparedWorkspace | null;
    workerHost: string | null;
    startedAt: string;
  }): Promise<string | null> | string | null;
  recordLifecycleEvent(input: {
    issue: SymphonyTrackerIssue;
    runId: string | null;
    source: "orchestrator" | "tracker" | "workspace" | "runtime";
    eventType: string;
    message?: string | null;
    payload?: unknown;
    recordedAt?: string;
  }): Promise<void> | void;
  finalizeRun(input: {
    issue: SymphonyTrackerIssue;
    runId: string | null;
    completion: SymphonyAgentRuntimeCompletion;
    workerHost: string | null;
    workspace: PreparedWorkspace | null;
    startedAt: string;
    endedAt: string;
    turnCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }): Promise<void> | void;
}

export type SymphonyClock = {
  now(): Date;
  nowMs(): number;
};

export type SymphonyOrchestratorSnapshot = {
  running: Array<
    SymphonyRunningEntry & {
      issueId: string;
      runtimeSeconds: number;
    }
  >;
  retrying: Array<
    SymphonyRetryEntry & {
      issueId: string;
    }
  >;
  claimedIssueIds: string[];
  completedIssueIds: string[];
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  nextPollDueAtMs: number | null;
  pollCheckInProgress: boolean;
  agentTotals: SymphonyAgentTotals;
  rateLimits: JsonObject | null;
};
