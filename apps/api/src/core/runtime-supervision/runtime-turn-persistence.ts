import type { SymphonyRuntimeRunStore } from "@symphony/db";
import type { HarnessTurnResult } from "@symphony/agent-harnesses";

export async function finalizePersistedTurnFromResult(input: {
  runId: string | null;
  persistedTurnId: string | null;
  runStore: SymphonyRuntimeRunStore;
  turnResult: HarnessTurnResult;
}): Promise<string | null> {
  if (!input.runId || !input.persistedTurnId) {
    return input.persistedTurnId;
  }

  const endedAt = new Date().toISOString();
  await input.runStore.finalizeTurn(input.persistedTurnId, {
    status:
      input.turnResult.kind === "failed"
        ? "failed"
        : "completed",
    endedAt,
    threadId: input.turnResult.threadId,
    agentTurnId: input.turnResult.turnId,
    usage: input.turnResult.usage,
    ...(input.turnResult.kind === "completed"
      ? {}
      : {
          metadata: {
            reason: input.turnResult.reason,
            terminalResultKind: input.turnResult.kind,
            ...(input.turnResult.kind === "awaiting_input"
              ? {
                  prompt: input.turnResult.prompt
                }
              : {}),
            ...(input.turnResult.kind === "failed"
              ? {
                  failureClass: input.turnResult.failureClass
                }
              : {})
          }
        })
  });

  return null;
}

export async function finalizeStoppedTurn(input: {
  runStore: SymphonyRuntimeRunStore;
  runId: string | null;
  persistedTurnId: string | null;
}): Promise<void> {
  if (!input.runId || !input.persistedTurnId) {
    return;
  }

  await input.runStore.finalizeTurn(input.persistedTurnId, {
    status: "stopped",
    endedAt: new Date().toISOString(),
    metadata: {
      stopReason: "runtime_stopped"
    }
  });
}

export async function finalizeTurnForDetectedCompletion(input: {
  runStore: SymphonyRuntimeRunStore;
  runId: string | null;
  persistedTurnId: string | null;
  turnResult?: HarnessTurnResult;
}): Promise<void> {
  if (!input.runId || !input.persistedTurnId) {
    return;
  }

  await input.runStore.finalizeTurn(input.persistedTurnId, {
    status: "completed",
    endedAt: new Date().toISOString(),
    threadId: input.turnResult?.threadId,
    agentTurnId: input.turnResult?.turnId,
    usage: input.turnResult?.usage,
    metadata: {
      stopReason: "terminal_result_detected"
    }
  });
}
