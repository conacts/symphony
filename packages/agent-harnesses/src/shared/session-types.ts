import type { AgentRuntimeLaunchTarget, SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { ThreadEvent, Usage } from "@symphony/agent-analytics";
import type { SymphonyImplementationModuleResult } from "@symphony/runtime-contract";
import type { SymphonyTrackerIssue } from "@symphony/tracker";

export type HarnessSessionLogger = {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
};

export class HarnessSessionError extends Error {
  readonly code: string;
  readonly detail: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "HarnessSessionError";
    this.code = code;
    this.detail = detail ?? null;
  }
}

export type HarnessTimeoutFailureClass =
  | "model_idle_timeout"
  | "run_timeout"
  | "tool_timeout";

export type HarnessTimeoutTriggerDetail = {
  failureClass: HarnessTimeoutFailureClass;
  thresholdMs: number;
  callId: string | null;
  toolName: string | null;
  commandText: string | null;
  lastActivityAt: string | null;
  lastActivityType: string | null;
};

export type HarnessTerminalTurnMetadata = {
  finalAssistantMessage: string | null;
  moduleResult: SymphonyImplementationModuleResult | null;
  stopReason: string | null;
  providerStopReason: string | null;
  lastActivityAt: string | null;
  lastActivityType: string | null;
};

export type HarnessAwaitingInputTurnDetail = HarnessTerminalTurnMetadata;

export type HarnessBlockedTurnDetail = HarnessTerminalTurnMetadata;

export type HarnessFailedTerminalResultDetail = {
  kind: "terminal_result";
  result: HarnessTerminalTurnMetadata;
  timeoutTrigger: HarnessTimeoutTriggerDetail | null;
};

export type HarnessTransportTimeoutFailureDetail = {
  kind: "transport_timeout";
  transportTimeoutMs: number;
  diagnostics: Record<string, unknown> | null;
};

export type HarnessRunnerErrorFailureDetail = {
  kind: "runner_error";
  failureClass: string | null;
  runnerEventType: string | null;
  diagnostics: Record<string, unknown> | null;
};

export type HarnessFailedTurnDetail =
  | HarnessFailedTerminalResultDetail
  | HarnessTransportTimeoutFailureDetail
  | HarnessRunnerErrorFailureDetail;

export type HarnessCompletionCandidate = {
  kind: "module_result";
  moduleResult: SymphonyImplementationModuleResult;
};

type HarnessTurnResultBase = {
  threadId: string;
  turnId: string;
  usage: Usage | null;
};

export type HarnessCompletedTurnResult = HarnessTurnResultBase & {
  kind: "completed";
};

export type HarnessAwaitingInputTurnResult = HarnessTurnResultBase & {
  kind: "awaiting_input";
  reason: string;
  prompt: string;
  detail: HarnessAwaitingInputTurnDetail;
};

export type HarnessBlockedTurnResult = HarnessTurnResultBase & {
  kind: "blocked";
  reason: string;
  detail: HarnessBlockedTurnDetail;
};

export type HarnessFailedTurnResult = HarnessTurnResultBase & {
  kind: "failed";
  reason: string;
  failureClass: string | null;
  detail: HarnessFailedTurnDetail;
};

export type HarnessTurnResult =
  | HarnessCompletedTurnResult
  | HarnessAwaitingInputTurnResult
  | HarnessBlockedTurnResult
  | HarnessFailedTurnResult;

export type HarnessRuntimeUpdate = {
  event: ThreadEvent;
  completionCandidate?: HarnessCompletionCandidate | null;
  rawPayload?: unknown;
};

export type HarnessSessionClient = {
  close(): void;
  runTurn(
    session: HarnessSession,
    input: {
      prompt: string;
      title: string;
      onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void;
      turnTimeoutMs: number;
    }
  ): Promise<HarnessTurnResult>;
};

export type HarnessSession = {
  client: HarnessSessionClient;
  threadId: string;
  workspacePath: string;
  hostLaunchPath: string;
  hostWorkspacePath: string | null;
  launchTarget: AgentRuntimeLaunchTarget;
  issue: SymphonyTrackerIssue;
  processId: string | null;
  autoApproveRequests: boolean;
  approvalPolicy: string | Record<string, unknown>;
  model: string;
  reasoningEffort: string;
  profile: string | null;
  providerId: string | null;
  providerName: string | null;
};

export type HarnessLaunchSessionInput = {
  launchTarget: AgentRuntimeLaunchTarget;
  env: Record<string, string>;
  hostCommandEnvSource?: Record<string, string | undefined>;
  runtimePolicy: SymphonyAgentRuntimeConfig;
  issue: SymphonyTrackerIssue;
  logger: HarnessSessionLogger;
};

export type HarnessLaunchSettings = {
  command: string;
  model: string;
  reasoningEffort: string;
  profile: string | null;
  providerId: string | null;
  providerName: string | null;
};

export type HarnessControlMessageResult =
  | "continue"
  | "approval_required"
  | "input_required"
  | "unhandled";

export function isHarnessTransportTimeoutFailureDetail(
  value: unknown
): value is HarnessTransportTimeoutFailureDetail {
  if (!isRecord(value) || value.kind !== "transport_timeout") {
    return false;
  }

  return (
    typeof value.transportTimeoutMs === "number" &&
    isRecordOrNull(value.diagnostics)
  );
}

export function isHarnessRunnerErrorFailureDetail(
  value: unknown
): value is HarnessRunnerErrorFailureDetail {
  if (!isRecord(value) || value.kind !== "runner_error") {
    return false;
  }

  return (
    (typeof value.failureClass === "string" || value.failureClass === null) &&
    (typeof value.runnerEventType === "string" ||
      value.runnerEventType === null) &&
    isRecordOrNull(value.diagnostics)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRecordOrNull(value: unknown): value is Record<string, unknown> | null {
  return value === null || isRecord(value);
}
