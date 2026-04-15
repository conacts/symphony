import type { AgentRuntimeLaunchTarget, SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { ThreadEvent, Usage } from "@symphony/agent-analytics";
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
  detail: unknown;
};

export type HarnessBlockedTurnResult = HarnessTurnResultBase & {
  kind: "blocked";
  reason: string;
  detail: unknown;
};

export type HarnessFailedTurnResult = HarnessTurnResultBase & {
  kind: "failed";
  reason: string;
  failureClass: string | null;
  detail: unknown;
};

export type HarnessTurnResult =
  | HarnessCompletedTurnResult
  | HarnessAwaitingInputTurnResult
  | HarnessBlockedTurnResult
  | HarnessFailedTurnResult;

export type HarnessRuntimeUpdate = {
  event: ThreadEvent;
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
