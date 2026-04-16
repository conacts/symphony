import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyAgentRuntimeConfig,
  SymphonyWorkerSessionContract
} from "@symphony/orchestrator";
import type { SymphonyRuntimeLogStore, SymphonyRuntimeRunStore } from "@symphony/db";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type { SymphonyRuntimeLaunchTarget } from "../agent-runtime-launch-target.js";
import type { ActiveRun, RunCallbacks } from "./runtime-supervision-types.js";
import { recordRunRepoEndSnapshot } from "./runtime-repo-snapshot-policy.js";
import { recordRuntimeRunOutcome } from "./runtime-lifecycle-recorder.js";
import { recordWorkerSessionCompletion } from "./runtime-worker-session.js";

export async function publishRuntimeCompletion(input: {
  workerSessionContract: SymphonyWorkerSessionContract;
  runtimeLogs: SymphonyRuntimeLogStore;
  sessionId: string | null;
  issueId: string;
  issueIdentifier: string;
  runId: string | null;
  attempt: number;
  runMode: SymphonyRunMode;
  completion: SymphonyAgentRuntimeCompletion;
  callbacks: RunCallbacks;
}): Promise<void> {
  const recordedAt = new Date().toISOString();
  await recordWorkerSessionCompletion({
    workerSessionContract: input.workerSessionContract,
    sessionId: input.sessionId,
    issueId: input.issueId,
    runId: input.runId,
    attempt: input.attempt,
    runMode: input.runMode,
    completion: input.completion,
    recordedAt
  });
  await recordRuntimeRunOutcome({
    runtimeLogs: input.runtimeLogs,
    issueIdentifier: input.issueIdentifier,
    runId: input.runId,
    completion: input.completion
  });
  await input.callbacks.onComplete(input.issueId, input.completion);
}

export async function reportCompletionOverride(input: {
  activeRun: ActiveRun;
  runtimeLogs: SymphonyRuntimeLogStore;
  workerSessionContract: SymphonyWorkerSessionContract;
  sessionId: string | null;
  issueId: string;
  issueIdentifier: string;
  runId: string | null;
  attempt: number;
  runMode: SymphonyRunMode;
  callbacks: RunCallbacks;
  launchTarget: SymphonyRuntimeLaunchTarget;
  runtimePolicy: SymphonyAgentRuntimeConfig;
  runStore: SymphonyRuntimeRunStore;
}): Promise<void> {
  if (!input.activeRun.completionOverride || input.activeRun.completionReported) {
    return;
  }

  await recordRunRepoEndSnapshot({
    runStore: input.runStore,
    runId: input.runId,
    launchTarget: input.launchTarget,
    timeoutMs: input.runtimePolicy.hooks.timeoutMs
  });

  await publishRuntimeCompletion({
    workerSessionContract: input.workerSessionContract,
    runtimeLogs: input.runtimeLogs,
    sessionId: input.sessionId,
    issueId: input.issueId,
    issueIdentifier: input.issueIdentifier,
    runId: input.runId,
    attempt: input.attempt,
    runMode: input.runMode,
    completion: input.activeRun.completionOverride,
    callbacks: input.callbacks
  });
  input.activeRun.completionReported = true;
}
