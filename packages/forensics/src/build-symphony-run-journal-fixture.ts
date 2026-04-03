import type {
  SymphonyEventAttrs,
  SymphonyRunFinishAttrs,
  SymphonyRunStartAttrs,
  SymphonyTurnFinishAttrs,
  SymphonyTurnStartAttrs
} from "@symphony/run-journal";

let fixtureCounter = 0;

export function buildSymphonyRunStartAttrs(
  overrides: Partial<SymphonyRunStartAttrs> = {}
): SymphonyRunStartAttrs {
  fixtureCounter += 1;

  return {
    issueId: `issue-${fixtureCounter}`,
    issueIdentifier: `COL-${fixtureCounter}`,
    attempt: 1,
    status: "running",
    workerHost: "docker-host",
    workspacePath: `/tmp/COL-${fixtureCounter}`,
    startedAt: new Date("2026-03-31T00:00:00.000Z"),
    commitHashStart: `commit-start-${fixtureCounter}`,
    repoStart: {
      dirty: true
    },
    metadata: {
      pickedUpBy: "test"
    },
    ...overrides
  };
}

export function buildSymphonyTurnStartAttrs(
  overrides: Partial<SymphonyTurnStartAttrs> = {}
): SymphonyTurnStartAttrs {
  fixtureCounter += 1;

  return {
    turnSequence: 1,
    codexThreadId: `thread-${fixtureCounter}`,
    codexTurnId: `turn-${fixtureCounter}`,
    codexSessionId: `session-${fixtureCounter}`,
    promptText: "Implement the requested change.",
    status: "running",
    startedAt: new Date("2026-03-31T00:00:00.000Z"),
    metadata: {
      source: "test"
    },
    ...overrides
  };
}

export function buildSymphonyEventAttrs(
  overrides: Partial<SymphonyEventAttrs> = {}
): SymphonyEventAttrs {
  fixtureCounter += 1;

  return {
    eventSequence: 1,
    eventType: "session_started",
    recordedAt: new Date("2026-03-31T00:00:01.000Z"),
    payload: {
      event: "session_started",
      sessionId: `session-${fixtureCounter}`
    },
    summary: "session started",
    codexThreadId: `thread-${fixtureCounter}`,
    codexTurnId: `turn-${fixtureCounter}`,
    codexSessionId: `session-${fixtureCounter}`,
    ...overrides
  };
}

export function buildSymphonyTurnFinishAttrs(
  overrides: Partial<SymphonyTurnFinishAttrs> = {}
): SymphonyTurnFinishAttrs {
  return {
    status: "completed",
    endedAt: new Date("2026-03-31T00:00:10.000Z"),
    tokens: {
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18
    },
    ...overrides
  };
}

export function buildSymphonyRunFinishAttrs(
  overrides: Partial<SymphonyRunFinishAttrs> = {}
): SymphonyRunFinishAttrs {
  return {
    status: "finished",
    outcome: "paused_max_turns",
    endedAt: new Date("2026-03-31T00:01:00.000Z"),
    commitHashEnd: "commit-end",
    repoEnd: {
      dirty: true
    },
    errorClass: "max_turns_reached",
    errorMessage: "Reached the configured max turns.",
    ...overrides
  };
}
