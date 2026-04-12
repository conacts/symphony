import { describe, expect, it, vi } from "vitest";
import {
  createSymphonyWorkerSessionContract,
  type SymphonyWorkerSessionCompletionInput,
  type SymphonyWorkerSessionObservationInput,
  type SymphonyWorkerSessionStartInput,
  type SymphonyWorkerSessionStopInput,
  type SymphonyWorkerSessionContract
} from "./worker-session-contract.js";

function buildSessionIdentity(): Pick<
  SymphonyWorkerSessionStartInput,
  "sessionId" | "issueId" | "runId" | "attempt" | "runMode"
> {
  return {
    sessionId: "session-123",
    issueId: "issue-123",
    runId: "run-123",
    attempt: 1,
    runMode: "implementation"
  };
}

describe("worker session contract", () => {
  it("requires the full lifecycle handler set before it can be used", () => {
    expect(() =>
      createSymphonyWorkerSessionContract({
        startSession: vi.fn(),
        recordObservation: vi.fn(),
        stopSession: vi.fn()
      })
    ).toThrow(TypeError);
  });

  it("preserves the provided session lifecycle handlers", async () => {
    const startSession = vi
      .fn()
      .mockImplementation(async (input: SymphonyWorkerSessionStartInput) => ({
        ...input,
        kind: "session_started" as const
      }));
    const recordObservation = vi
      .fn()
      .mockImplementation(
        async (input: SymphonyWorkerSessionObservationInput) => ({
          ...input,
          kind: "session_observation_recorded" as const
        })
      );
    const stopSession = vi
      .fn()
      .mockImplementation(async (input: SymphonyWorkerSessionStopInput) => ({
        ...input,
        kind: "session_stopped" as const
      }));
    const completeSession = vi
      .fn()
      .mockImplementation(
        async (input: SymphonyWorkerSessionCompletionInput) => ({
          ...input,
          kind: "session_completed" as const
        })
      );

    const contract: SymphonyWorkerSessionContract =
      createSymphonyWorkerSessionContract({
        startSession,
        recordObservation,
        stopSession,
        completeSession
      });

    const identity = buildSessionIdentity();

    await expect(
      contract.startSession({
        ...identity,
        startedAt: "2026-04-12T00:00:00.000Z",
        workerHost: "worker-a"
      })
    ).resolves.toEqual({
      ...identity,
      startedAt: "2026-04-12T00:00:00.000Z",
      workerHost: "worker-a",
      kind: "session_started"
    });

    await expect(
      contract.recordObservation({
        ...identity,
        recordedAt: "2026-04-12T00:01:00.000Z",
        eventType: "runtime_update",
        payload: {
          message: "heartbeat"
        }
      })
    ).resolves.toEqual({
      ...identity,
      recordedAt: "2026-04-12T00:01:00.000Z",
      eventType: "runtime_update",
      payload: {
        message: "heartbeat"
      },
      kind: "session_observation_recorded"
    });

    await expect(
      contract.stopSession({
        ...identity,
        recordedAt: "2026-04-12T00:02:00.000Z",
        reason: "shutdown"
      })
    ).resolves.toEqual({
      ...identity,
      recordedAt: "2026-04-12T00:02:00.000Z",
      reason: "shutdown",
      kind: "session_stopped"
    });

    await expect(
      contract.completeSession({
        ...identity,
        recordedAt: "2026-04-12T00:03:00.000Z",
        status: "completed",
        reason: null
      })
    ).resolves.toEqual({
      ...identity,
      recordedAt: "2026-04-12T00:03:00.000Z",
      status: "completed",
      reason: null,
      kind: "session_completed"
    });

    expect(startSession).toHaveBeenCalledTimes(1);
    expect(recordObservation).toHaveBeenCalledTimes(1);
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(completeSession).toHaveBeenCalledTimes(1);
  });
});
