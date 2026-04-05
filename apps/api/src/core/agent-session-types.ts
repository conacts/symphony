import type {
  SymphonyAgentRuntimeConfig
} from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type { SymphonyRuntimeLaunchTarget } from "./agent-runtime-launch-target.js";

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

export type HarnessToolExecutor = (
  toolName: string | null,
  argumentsPayload: unknown
) => Promise<Record<string, unknown>>;

export type HarnessTurnResult = {
  sessionId: string;
  threadId: string;
  turnId: string;
};

export type HarnessSessionClient = {
  close(): void;
  runTurn(
    session: HarnessSession,
    input: {
      prompt: string;
      title: string;
      sandboxPolicy: Record<string, unknown> | null;
      toolExecutor: HarnessToolExecutor;
      onMessage: (message: Record<string, unknown>) => Promise<void> | void;
      turnTimeoutMs: number;
    }
  ): Promise<HarnessTurnResult>;
};

export type HarnessSession = {
  client: HarnessSessionClient;
  threadId: string | null;
  workspacePath: string;
  hostLaunchPath: string;
  hostWorkspacePath: string | null;
  launchTarget: SymphonyRuntimeLaunchTarget;
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
  launchTarget: SymphonyRuntimeLaunchTarget;
  env: Record<string, string>;
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
