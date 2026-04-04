import type { JsonObject } from "@symphony/contracts";

export type SymphonyRuntimeCodexUsage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};

export type SymphonyRuntimeRunStatus =
  | "dispatching"
  | "running"
  | "finished"
  | "paused"
  | "failed"
  | "startup_failed"
  | "rate_limited"
  | "stalled"
  | "stopped";

export type SymphonyRuntimeTurnStatus =
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export type SymphonyRuntimeRunStartAttrs = {
  issueId: string;
  issueIdentifier: string;
  runId?: string;
  attempt?: number | null;
  status: SymphonyRuntimeRunStatus;
  workerHost?: string | null;
  workspacePath?: string | null;
  startedAt?: Date | string;
  commitHashStart?: string | null;
  repoStart?: JsonObject | null;
  metadata?: JsonObject | null;
};

export type SymphonyRuntimeTurnStartAttrs = {
  turnId?: string;
  turnSequence?: number;
  codexThreadId?: string | null;
  codexTurnId?: string | null;
  codexSessionId?: string | null;
  promptText: string;
  status: SymphonyRuntimeTurnStatus;
  startedAt?: Date | string;
  metadata?: JsonObject | null;
};

export type SymphonyRuntimeTurnUpdateAttrs = {
  status?: SymphonyRuntimeTurnStatus;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  codexThreadId?: string | null;
  codexTurnId?: string | null;
  codexSessionId?: string | null;
  usage?: SymphonyRuntimeCodexUsage | null;
  metadata?: JsonObject | null;
};

export type SymphonyRuntimeTurnFinishAttrs = {
  status: SymphonyRuntimeTurnStatus;
  endedAt: Date | string;
  codexThreadId?: string | null;
  codexTurnId?: string | null;
  codexSessionId?: string | null;
  usage?: SymphonyRuntimeCodexUsage | null;
  metadata?: JsonObject | null;
};

export type SymphonyRuntimeRunUpdateAttrs = {
  status?: SymphonyRuntimeRunStatus;
  outcome?: string | null;
  workerHost?: string | null;
  workspacePath?: string | null;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  commitHashStart?: string | null;
  commitHashEnd?: string | null;
  repoStart?: JsonObject | null;
  repoEnd?: JsonObject | null;
  metadata?: JsonObject | null;
  errorClass?: string | null;
  errorMessage?: string | null;
};

export type SymphonyRuntimeRunFinishAttrs = {
  status: SymphonyRuntimeRunStatus;
  outcome?: string | null;
  endedAt: Date | string;
  commitHashEnd?: string | null;
  repoEnd?: JsonObject | null;
  metadata?: JsonObject | null;
  errorClass?: string | null;
  errorMessage?: string | null;
};
