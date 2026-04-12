import type { JsonObject } from "@symphony/contracts";
import type { SymphonyRunMode } from "@symphony/runtime-contract";

export type SymphonyWorkerSessionIdentity = {
  sessionId: string;
  issueId: string;
  runId: string | null;
  attempt: number;
  runMode: SymphonyRunMode;
};

export type SymphonyWorkerSessionStartInput = SymphonyWorkerSessionIdentity & {
  startedAt: string;
  workerHost: string | null;
};

export type SymphonyWorkerSessionStartRecord =
  SymphonyWorkerSessionStartInput & {
    kind: "session_started";
  };

export type SymphonyWorkerSessionObservationInput =
  SymphonyWorkerSessionIdentity & {
    recordedAt: string;
    eventType: string;
    payload: JsonObject | null;
  };

export type SymphonyWorkerSessionObservationRecord =
  SymphonyWorkerSessionObservationInput & {
    kind: "session_observation_recorded";
  };

export type SymphonyWorkerSessionStopInput = SymphonyWorkerSessionIdentity & {
  recordedAt: string;
  reason: string;
};

export type SymphonyWorkerSessionStopRecord = SymphonyWorkerSessionStopInput & {
  kind: "session_stopped";
};

export type SymphonyWorkerSessionCompletionStatus =
  | "completed"
  | "failed"
  | "cancelled";

export type SymphonyWorkerSessionCompletionInput =
  SymphonyWorkerSessionIdentity & {
    recordedAt: string;
    status: SymphonyWorkerSessionCompletionStatus;
    reason: string | null;
  };

export type SymphonyWorkerSessionCompletionRecord =
  SymphonyWorkerSessionCompletionInput & {
    kind: "session_completed";
  };

export interface SymphonyWorkerSessionContract {
  startSession(
    input: SymphonyWorkerSessionStartInput
  ):
    | Promise<SymphonyWorkerSessionStartRecord>
    | SymphonyWorkerSessionStartRecord;
  recordObservation(
    input: SymphonyWorkerSessionObservationInput
  ):
    | Promise<SymphonyWorkerSessionObservationRecord>
    | SymphonyWorkerSessionObservationRecord;
  stopSession(
    input: SymphonyWorkerSessionStopInput
  ):
    | Promise<SymphonyWorkerSessionStopRecord>
    | SymphonyWorkerSessionStopRecord;
  completeSession(
    input: SymphonyWorkerSessionCompletionInput
  ):
    | Promise<SymphonyWorkerSessionCompletionRecord>
    | SymphonyWorkerSessionCompletionRecord;
}

export function createSymphonyWorkerSessionContract(
  input: Partial<SymphonyWorkerSessionContract>
): SymphonyWorkerSessionContract {
  assertWorkerSessionHandler("startSession", input.startSession);
  assertWorkerSessionHandler("recordObservation", input.recordObservation);
  assertWorkerSessionHandler("stopSession", input.stopSession);
  assertWorkerSessionHandler("completeSession", input.completeSession);

  return {
    startSession: input.startSession,
    recordObservation: input.recordObservation,
    stopSession: input.stopSession,
    completeSession: input.completeSession
  };
}

function assertWorkerSessionHandler(
  name: keyof SymphonyWorkerSessionContract,
  value: unknown
): asserts value is SymphonyWorkerSessionContract[typeof name] {
  if (typeof value !== "function") {
    throw new TypeError(
      `Symphony worker session contract requires a ${name} handler.`
    );
  }
}
