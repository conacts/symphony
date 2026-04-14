import type { JsonObject } from "@symphony/contracts";
import type { SymphonyRunOutcome } from "@symphony/runtime-run-ledger";
import type { SymphonyLifecycleBindingScope } from "./lifecycle-binding-scope.js";

export type SymphonyRuntimeAgentUsage = {
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

export type SymphonyRuntimeRunMode = "implementation" | "rework";
export type SymphonyRuntimeRunOutcome = SymphonyRunOutcome;

export type SymphonyRuntimeMachineLoadSummary = {
  sampleCount: number;
  maxCpuPercent: number | null;
  avgCpuPercent: number | null;
  maxMemoryPercent: number;
  avgMemoryPercent: number;
  maxDiskPercent: number | null;
  avgDiskPercent: number | null;
  hadHighCpu: boolean;
  hadHighMemory: boolean;
  hadHighDisk: boolean;
};

export type SymphonyRuntimeTurnStatus =
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export type SymphonyRuntimeRunStartAttrs = {
  repositoryKey: string;
  trackerIssueId: string;
  issueIdentifier: string;
  bindingScope?: SymphonyLifecycleBindingScope | null;
  runId: string;
  attempt?: number | null;
  runMode: SymphonyRuntimeRunMode;
  status: SymphonyRuntimeRunStatus;
  workerHost?: string | null;
  workspacePath?: string | null;
  startedAt: Date | string;
  commitHashStart?: string | null;
  repoStart?: JsonObject | null;
  metadata?: JsonObject | null;
};

export type SymphonyRuntimeTurnStartAttrs = {
  turnId: string;
  turnSequence: number;
  threadId: string;
  agentTurnId?: string | null;
  promptText: string;
  status: SymphonyRuntimeTurnStatus;
  startedAt: Date | string;
  metadata?: JsonObject | null;
};

export type SymphonyRuntimeTurnUpdateAttrs = {
  status?: SymphonyRuntimeTurnStatus;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  threadId?: string;
  agentTurnId?: string | null;
  usage?: SymphonyRuntimeAgentUsage | null;
  metadata?: JsonObject | null;
};

export type SymphonyRuntimeTurnFinishAttrs = {
  status: SymphonyRuntimeTurnStatus;
  endedAt: Date | string;
  threadId?: string;
  agentTurnId?: string | null;
  usage?: SymphonyRuntimeAgentUsage | null;
  metadata?: JsonObject | null;
};

export type SymphonyRuntimeRunUpdateAttrs = {
  status?: SymphonyRuntimeRunStatus;
  outcome?: SymphonyRunOutcome | null;
  runMode?: SymphonyRuntimeRunMode;
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
  machineLoadSummary?: SymphonyRuntimeMachineLoadSummary | null;
};

export type SymphonyRuntimeRunFinishAttrs = {
  status: SymphonyRuntimeRunStatus;
  outcome?: SymphonyRunOutcome | null;
  runMode?: SymphonyRuntimeRunMode;
  endedAt: Date | string;
  commitHashEnd?: string | null;
  repoEnd?: JsonObject | null;
  metadata?: JsonObject | null;
  errorClass?: string | null;
  errorMessage?: string | null;
  machineLoadSummary?: SymphonyRuntimeMachineLoadSummary | null;
};

export type SymphonyRuntimeRunContextAttrs = {
  harnessKind?: "pi" | null;
  threadId: string;
  processId?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  profile?: string | null;
  providerId?: string | null;
  providerName?: string | null;
  authMode?: string | null;
  providerEnvKey?: string | null;
  launchTarget?: JsonObject | null;
};
