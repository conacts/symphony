import type {
  SymphonyResolvedWorkflowConfig
} from "@symphony/core";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type { CodexRuntimeLaunchTarget } from "./codex-runtime-launch-target.js";

export type CodexAppServerLogger = {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
};

export class CodexAppServerError extends Error {
  readonly code: string;
  readonly detail: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "CodexAppServerError";
    this.code = code;
    this.detail = detail ?? null;
  }
}

export type CodexAppServerToolExecutor = (
  toolName: string | null,
  argumentsPayload: unknown
) => Promise<Record<string, unknown>>;

export type CodexAppServerTurnResult = {
  sessionId: string;
  threadId: string;
  turnId: string;
};

export type CodexAppServerSessionClient = {
  close(): void;
  runTurn(
    session: CodexAppServerSession,
    input: {
      prompt: string;
      title: string;
      sandboxPolicy: Record<string, unknown> | null;
      toolExecutor: CodexAppServerToolExecutor;
      onMessage: (message: Record<string, unknown>) => Promise<void> | void;
      turnTimeoutMs: number;
    }
  ): Promise<CodexAppServerTurnResult>;
};

export type CodexAppServerSession = {
  client: CodexAppServerSessionClient;
  threadId: string;
  workspacePath: string;
  hostLaunchPath: string;
  hostWorkspacePath: string | null;
  launchTarget: CodexRuntimeLaunchTarget;
  issue: SymphonyTrackerIssue;
  processId: string | null;
  autoApproveRequests: boolean;
  approvalPolicy: string | Record<string, unknown>;
  model: string;
  reasoningEffort: string;
};

export type CodexLaunchSessionInput = {
  launchTarget: CodexRuntimeLaunchTarget;
  env: Record<string, string>;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  issue: SymphonyTrackerIssue;
  logger: CodexAppServerLogger;
};

export type CodexLaunchSettings = {
  command: string;
  model: string;
  reasoningEffort: string;
};

export type ControlMessageResult =
  | "continue"
  | "approval_required"
  | "input_required"
  | "unhandled";
