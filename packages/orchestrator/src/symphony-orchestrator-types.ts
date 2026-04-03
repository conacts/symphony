import type {
  AgentRuntimeLaunchTarget
} from "./agent-runtime.js";
import type { SymphonyJsonObject } from "@symphony/run-journal";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type {
  PreparedWorkspace,
  WorkspaceManifestLifecyclePhase
} from "@symphony/workspace";

export type SymphonyCodexMessage = {
  event: string;
  message: unknown;
  timestamp: string;
};

export type SymphonyCodexTotals = {
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
  | "codex_auth_contract"
  | "runtime_launch"
  | "codex_startup";

export type SymphonyRunningEntry = {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  sessionId: string | null;
  workerHost: string | null;
  workspace: PreparedWorkspace | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
  workspacePath: string | null;
  retryAttempt: number;
  turnCount: number;
  lastCodexMessage: SymphonyCodexMessage | null;
  lastCodexTimestamp: string | null;
  lastCodexEvent: string | null;
  codexInputTokens: number;
  codexOutputTokens: number;
  codexTotalTokens: number;
  codexLastReportedInputTokens: number;
  codexLastReportedOutputTokens: number;
  codexLastReportedTotalTokens: number;
  lastRateLimits: SymphonyJsonObject | null;
  codexAppServerPid: string | null;
  startedAt: string;
};

export type SymphonyRetryEntry = {
  attempt: number;
  dueAtMs: number;
  retryToken: string;
  identifier: string;
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
  running: Record<string, SymphonyRunningEntry>;
  completed: Set<string>;
  claimed: Set<string>;
  retryAttempts: Record<string, SymphonyRetryEntry>;
  codexTotals: SymphonyCodexTotals;
  rateLimits: SymphonyJsonObject | null;
};

export type SymphonyAgentRuntimeCompletion =
  | { kind: "normal" }
  | { kind: "max_turns_reached"; reason: string; maxTurns: number }
  | {
      kind: "startup_failure";
      reason: string;
      failureStage: SymphonyStartupFailureStage;
      failureOrigin: SymphonyStartupFailureOrigin;
      launchTarget?: AgentRuntimeLaunchTarget | null;
      manifestLifecyclePhase?: WorkspaceManifestLifecyclePhase | null;
      manifestLifecycleStepName?: string | null;
      manifestLifecycle?: SymphonyJsonObject | null;
    }
  | { kind: "rate_limited"; reason: string }
  | { kind: "stalled"; reason: string }
  | { kind: "failure"; reason: string };

export type SymphonyAgentRuntimeUpdate = {
  event: string;
  payload?: unknown;
  timestamp: string;
  sessionId?: string | null;
  codexAppServerPid?: string | null;
};

export interface SymphonyOrchestratorObserver {
  startRun(input: {
    issue: SymphonyTrackerIssue;
    attempt: number;
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
  codexTotals: SymphonyCodexTotals;
  rateLimits: SymphonyJsonObject | null;
};
