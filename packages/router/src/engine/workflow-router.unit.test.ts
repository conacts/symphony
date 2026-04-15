import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  AmbiguousTransitionError,
  DuplicateCommandIdError,
  DuplicateSignalIdError,
  ProjectionCorruptedError
} from "../index.js";
import type { WorkflowJournalEvent } from "../index.js";
import {
  createWorkflowRouterTestBuilder,
  recordSignalEvent,
  settleCommandEvent
} from "../testing/workflow-router-test-kit.js";
import type { WorkflowSignal } from "../types/index.js";

type TestNode =
  | "queued"
  | "implementation"
  | "review"
  | "changes_requested"
  | "done";

type TestData = {
  seenSignals: string[];
};

type TestPolicy = {
  allowReviewApproval?: boolean;
};

async function createTestRouter() {
  return await Effect.runPromise(
    createWorkflowRouterTestBuilder<TestNode, TestData, TestPolicy>()
      .named("test-router")
      .startingAt("queued")
      .withInitialData({
        seenSignals: []
      })
      .withNode("queued")
      .withNode("implementation", {
        enter: () => [
          {
            id: "command_dispatch_implementation",
            kind: "dispatch",
            dedupeKey: null,
            payload: {
              target: "implementation"
            }
          }
        ]
      })
      .withNode("review")
      .withNode("changes_requested")
      .withNode("done", {
        terminal: true
      })
      .withEdge({
        id: "queued_to_implementation",
        from: "queued",
        to: "implementation",
        reasonCode: "begin_implementation",
        guard: ({ signal }) =>
          signal.type === "tracker.state_changed" &&
          signal.payload !== null &&
          signal.payload["state"] === "Todo",
        commands: () => [
          {
            id: "command_audit_queued_to_implementation",
            kind: "audit",
            dedupeKey: null,
            payload: {
              transition: "queued_to_implementation"
            }
          }
        ]
      })
      .withEdge({
        id: "review_to_done",
        from: "review",
        to: "done",
        priority: 10,
        reasonCode: "approved",
        guard: ({ signal, policy }) =>
          policy.allowReviewApproval === true &&
          signal.type === "review.approved"
      })
      .withEdge({
        id: "review_to_changes_requested",
        from: "review",
        to: "changes_requested",
        reasonCode: "changes_requested",
        guard: ({ signal }) => signal.type === "review.changes_requested"
      })
      .withReducer(({ data, event }) =>
        event.kind === "signal_recorded"
          ? {
              ...data,
              seenSignals: [...data.seenSignals, event.signal.type]
            }
          : data
      )
      .withRouterOptions({
        now: () => new Date("2026-04-09T23:00:00.000Z"),
        createId: (prefix) => `${prefix}_fixed`
      })
      .build()
  );
}

function createTestSignal(
  overrides: Partial<WorkflowSignal> & Pick<WorkflowSignal, "type" | "source" | "payload">
): WorkflowSignal {
  return {
    id: overrides.id ?? "signal_fixed",
    type: overrides.type,
    source: overrides.source,
    occurredAt: overrides.occurredAt ?? "2026-04-09T23:00:00.000Z",
    causationId: overrides.causationId ?? null,
    correlationId: overrides.correlationId ?? null,
    payload: overrides.payload
  };
}

describe("WorkflowRouter", () => {
  it("projects the initial node from an empty history", async () => {
    const router = await createTestRouter();
    const projection = await Effect.runPromise(
      router.project({
        workflowId: "SYM-100",
        history: [],
        policy: {}
      })
    );

    expect(projection.currentNode).toBe("queued");
    expect(projection.terminal).toBe(false);
    expect(projection.pendingCommands).toEqual([]);
    expect(projection.recordedSignalIds).toEqual([]);
    expect(projection.emittedCommandIds).toEqual([]);
    expect(projection.lastSignal).toBeNull();
    expect(projection.lastDecision).toBeNull();
  });

  it("routes a matching signal and emits edge plus enter commands", async () => {
    const router = await createTestRouter();
    const result = await Effect.runPromise(
      router.receive({
        workflowId: "SYM-101",
        history: [],
        signal: createTestSignal({
          type: "tracker.state_changed",
          source: "tracker",
          payload: {
            state: "Todo"
          }
        }),
        policy: {}
      })
    );

    expect(result.projectionBefore.currentNode).toBe("queued");
    expect(result.decision.fromNode).toBe("queued");
    expect(result.decision.toNode).toBe("implementation");
    expect(result.decision.edgeId).toBe("queued_to_implementation");
    expect(result.decision.reasonCode).toBe("begin_implementation");
    expect(result.decision.commands.map((command) => command.kind)).toEqual([
      "audit",
      "dispatch"
    ]);
    expect(result.projectionAfter.currentNode).toBe("implementation");
    expect(result.projectionAfter.pendingCommands).toHaveLength(2);
    expect(result.projectionAfter.recordedSignalIds).toEqual(["signal_fixed"]);
    expect(result.projectionAfter.emittedCommandIds).toEqual([
      "command_audit_queued_to_implementation",
      "command_dispatch_implementation"
    ]);
    expect(result.projectionAfter.data.seenSignals).toEqual([
      "tracker.state_changed"
    ]);
  });

  it("records a no-match decision when no edge is eligible", async () => {
    const router = await createTestRouter();
    const result = await Effect.runPromise(
      router.receive({
        workflowId: "SYM-102",
        history: [],
        signal: createTestSignal({
          type: "operator.noop",
          source: "operator",
          payload: null
        }),
        policy: {}
      })
    );

    expect(result.decision.edgeId).toBeNull();
    expect(result.decision.toNode).toBe("queued");
    expect(result.decision.reasonCode).toBe("no_matching_edge");
    expect(result.decision.commands).toEqual([]);
    expect(result.projectionAfter.currentNode).toBe("queued");
  });

  it("removes settled commands from the pending projection", async () => {
    const router = await createTestRouter();
    const result = await Effect.runPromise(
      router.receive({
        workflowId: "SYM-103",
        history: [],
        signal: createTestSignal({
          type: "tracker.state_changed",
          source: "tracker",
          payload: {
            state: "Todo"
          }
        }),
        policy: {}
      })
    );

    const emittedCommand = result.decision.commands[0];
    expect(emittedCommand).toBeDefined();

    const projection = await Effect.runPromise(
      router.project({
        workflowId: "SYM-103",
        history: [
          ...result.events,
          settleCommandEvent({
            commandId: emittedCommand!.id,
            status: "succeeded",
            recordedAt: "2026-04-09T23:00:01.000Z"
          })
        ],
        policy: {}
      })
    );

    expect(projection.pendingCommands.map((command) => command.id)).toEqual([
      "command_dispatch_implementation"
    ]);
  });

  it("rehydrates from a checkpoint plus tail history", async () => {
    const router = await createTestRouter();
    const result = await Effect.runPromise(
      router.receive({
        workflowId: "SYM-103A",
        history: [],
        signal: createTestSignal({
          type: "tracker.state_changed",
          source: "tracker",
          payload: {
            state: "Todo"
          }
        }),
        policy: {}
      })
    );

    const tailHistory: WorkflowJournalEvent<TestNode>[] = [
      settleCommandEvent({
        commandId: "command_audit_queued_to_implementation",
        status: "succeeded",
        recordedAt: "2026-04-09T23:00:01.000Z"
      })
    ];

    const fullReplayProjection = await Effect.runPromise(
      router.project({
        workflowId: "SYM-103A",
        history: [...result.events, ...tailHistory],
        policy: {}
      })
    );

    const rehydratedProjection = await Effect.runPromise(
      router.rehydrate({
        projection: result.projectionAfter,
        tailHistory,
        policy: {}
      })
    );

    expect(rehydratedProjection).toEqual(fullReplayProjection);
    expect(rehydratedProjection.pendingCommands.map((command) => command.id)).toEqual([
      "command_dispatch_implementation"
    ]);
  });

  it("rejects rehydration when the checkpoint cannot settle a tail command", async () => {
    const router = await createTestRouter();
    const result = await Effect.runPromise(
      router.receive({
        workflowId: "SYM-103B",
        history: [],
        signal: createTestSignal({
          type: "tracker.state_changed",
          source: "tracker",
          payload: {
            state: "Todo"
          }
        }),
        policy: {}
      })
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          router.rehydrate({
            projection: result.projectionAfter,
            tailHistory: [
              settleCommandEvent({
                commandId: "command_missing",
                status: "succeeded",
                recordedAt: "2026-04-09T23:00:01.000Z"
              })
            ],
            policy: {}
          })
        )
      )
    ).resolves.toBeInstanceOf(ProjectionCorruptedError);
  });

  it("rejects duplicate signal ids", async () => {
    const router = await createTestRouter();
    const history: WorkflowJournalEvent<TestNode>[] = [
      recordSignalEvent(
        {
          id: "signal_duplicate",
          type: "tracker.state_changed",
          source: "tracker",
          occurredAt: "2026-04-09T23:00:00.000Z",
          payload: {
            state: "Todo"
          },
          causationId: null,
          correlationId: null
        },
        "2026-04-09T23:00:00.000Z"
      )
    ];

    await expect(
      Effect.runPromise(
        Effect.flip(
          router.receive({
            workflowId: "SYM-104",
            history,
            signal: createTestSignal({
              id: "signal_duplicate",
              type: "tracker.state_changed",
              source: "tracker",
              payload: {
                state: "Todo"
              }
            }),
            policy: {}
          })
        )
      )
    ).resolves.toBeInstanceOf(DuplicateSignalIdError);
  });

  it("fails deterministic routing when multiple highest-priority edges match", async () => {
    const router = await Effect.runPromise(
      createWorkflowRouterTestBuilder<TestNode, TestData, TestPolicy>()
        .named("ambiguous-router")
        .startingAt("queued")
        .withInitialData({
          seenSignals: []
        })
        .withNode("queued")
        .withNode("implementation")
        .withNode("review")
        .withNode("changes_requested")
        .withNode("done", {
          terminal: true
        })
        .withEdge({
          id: "wildcard_a",
          from: "queued",
          to: "implementation",
          priority: 5,
          reasonCode: "a",
          guard: () => true
        })
        .withEdge({
          id: "wildcard_b",
          from: "queued",
          to: "review",
          priority: 5,
          reasonCode: "b",
          guard: () => true
        })
        .build()
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          router.receive({
            workflowId: "SYM-105",
            history: [],
            signal: createTestSignal({
              type: "router.test",
              source: "router",
              payload: null
            }),
            policy: {}
          })
        )
      )
    ).resolves.toBeInstanceOf(AmbiguousTransitionError);
  });

  it("fails projection when settling an unknown command id", async () => {
    const router = await createTestRouter();

    await expect(
      Effect.runPromise(
        Effect.flip(
          router.project({
            workflowId: "SYM-106",
            history: [
              settleCommandEvent({
                commandId: "missing_command",
                status: "failed",
                recordedAt: "2026-04-09T23:00:00.000Z"
              })
            ],
            policy: {}
          })
        )
      )
    ).resolves.toBeInstanceOf(ProjectionCorruptedError);
  });

  it("starts a session and appends history as signals are received", async () => {
    const router = await createTestRouter();
    const session = await Effect.runPromise(
      router.startSession({
        workflowId: "SYM-107",
        policy: {}
      })
    );

    expect(session.history()).toEqual([]);
    expect(session.projection().currentNode).toBe("queued");

    const result = await Effect.runPromise(
      session.receive({
        ...createTestSignal({
          type: "tracker.state_changed",
          source: "tracker",
          payload: {
            state: "Todo"
          }
        })
      })
    );

    expect(result.projectionAfter.currentNode).toBe("implementation");
    expect(session.projection().currentNode).toBe("implementation");
    expect(session.history()).toHaveLength(4);
  });

  it("lets a session settle commands and update the projection in place", async () => {
    const router = await createTestRouter();
    const session = await Effect.runPromise(
      router.startSession({
        workflowId: "SYM-108",
        policy: {}
      })
    );

    await Effect.runPromise(
      session.receive({
        ...createTestSignal({
          type: "tracker.state_changed",
          source: "tracker",
          payload: {
            state: "Todo"
          }
        })
      })
    );

    const nextProjection = await Effect.runPromise(
      session.settleCommand({
        commandId: "command_audit_queued_to_implementation",
        status: "succeeded",
        payload: null,
        recordedAt: "2026-04-09T23:00:01.000Z"
      })
    );

    expect(nextProjection.pendingCommands.map((command) => command.id)).toEqual([
      "command_dispatch_implementation"
    ]);
    expect(session.history()).toHaveLength(5);
  });

  it("preserves duplicate signal protection across resumed sessions", async () => {
    const router = await createTestRouter();
    const firstResult = await Effect.runPromise(
      router.receive({
        workflowId: "SYM-109",
        history: [],
        signal: createTestSignal({
          id: "signal_resume_duplicate",
          type: "tracker.state_changed",
          source: "tracker",
          payload: {
            state: "Todo"
          }
        }),
        policy: {}
      })
    );

    const resumedSession = await Effect.runPromise(
      router.resumeSession({
        projection: firstResult.projectionAfter,
        history: [],
        policy: {}
      })
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          resumedSession.receive(createTestSignal({
            id: "signal_resume_duplicate",
            type: "operator.noop",
            source: "operator",
            payload: null
          }))
        )
      )
    ).resolves.toBeInstanceOf(DuplicateSignalIdError);
  });

  it("preserves emitted command id protection across projection checkpoints", async () => {
    const router = await createTestRouter();

    await expect(
      Effect.runPromise(
        Effect.flip(
          router.receiveFromProjection({
            projection: {
              workflowId: "SYM-110",
              currentNode: "queued",
              pendingCommands: [],
              recordedSignalIds: [],
              emittedCommandIds: [
                "command_audit_queued_to_implementation",
                "command_dispatch_implementation"
              ],
              terminal: false,
              sequence: 0,
              data: {
                seenSignals: []
              },
              lastSignal: null,
              lastDecision: null
            },
            signal: createTestSignal({
              id: "signal_resume_command_duplicate",
              type: "tracker.state_changed",
              source: "tracker",
              payload: {
                state: "Todo"
              }
            }),
            policy: {}
          })
        )
      )
    ).resolves.toBeInstanceOf(DuplicateCommandIdError);
  });
});
