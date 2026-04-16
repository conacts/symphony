import {
  createSymphonyWorkerSessionContract,
  type SymphonyAgentRuntimeCompletion,
  type SymphonyWorkerSessionContract
} from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";

export function createDefaultWorkerSessionContract(): SymphonyWorkerSessionContract {
  return createSymphonyWorkerSessionContract({
    startSession: async (input) => ({
      ...input,
      kind: "session_started"
    }),
    recordObservation: async (input) => ({
      ...input,
      kind: "session_observation_recorded"
    }),
    stopSession: async (input) => ({
      ...input,
      kind: "session_stopped"
    }),
    completeSession: async (input) => ({
      ...input,
      kind: "session_completed"
    })
  });
}

export async function recordWorkerSessionCompletion(input: {
  workerSessionContract: SymphonyWorkerSessionContract;
  sessionId: string | null;
  issueId: string;
  runId: string | null;
  attempt: number;
  runMode: SymphonyRunMode;
  completion: SymphonyAgentRuntimeCompletion;
  recordedAt: string;
}): Promise<void> {
  if (!input.sessionId) {
    return;
  }

  await input.workerSessionContract.completeSession({
    sessionId: input.sessionId,
    issueId: input.issueId,
    runId: input.runId,
    attempt: input.attempt,
    runMode: input.runMode,
    recordedAt: input.recordedAt,
    status: completionStatusForRuntimeCompletion(input.completion),
    reason: completionReasonForRuntimeCompletion(input.completion)
  });
}

function completionStatusForRuntimeCompletion(
  completion: SymphonyAgentRuntimeCompletion
): "completed" | "failed" | "cancelled" {
  switch (completion.kind) {
    case "failure":
    case "startup_failure":
    case "rate_limited":
    case "provider_transient":
    case "stalled":
    case "terminal_result_failure":
      return "failed";
    default:
      return "completed";
  }
}

function completionReasonForRuntimeCompletion(
  completion: SymphonyAgentRuntimeCompletion
): string | null {
  switch (completion.kind) {
    case "failure":
    case "startup_failure":
    case "rate_limited":
    case "provider_transient":
    case "stalled":
    case "terminal_result_failure":
      return completion.reason;
    default:
      return null;
  }
}
