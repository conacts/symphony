import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  createSymphonyCurrentFlowRouter,
  createSymphonyCurrentFlowRouterAsync,
  type SymphonyCurrentFlowNode
} from "./symphony-current-flow-router.js";
import {
  replaySymphonyCurrentFlowFixture,
  symphonyCurrentFlowReplayFixtures
} from "./testing/symphony-current-flow-replay-fixtures.js";

describe("Symphony current-flow router fixture", () => {
  it("builds the mocked current Symphony router definition", async () => {
    const router = await Effect.runPromise(
      createSymphonyCurrentFlowRouter()
    );

    expect(router.definition().name).toBe("symphony-current-flow");
    expect(router.definition().initialNode).toBe("idle");
    expect(router.definition().nodes.map((node) => node.id)).toEqual([
      "idle",
      "bootstrapping",
      "implementation",
      "rework",
      "review",
      "approved_merge",
      "done",
      "canceled",
      "paused",
      "blocked",
      "failed"
    ]);
  });

  it.each(symphonyCurrentFlowReplayFixtures)(
    "replays $name",
    async (fixture) => {
      const replay = await replaySymphonyCurrentFlowFixture(fixture);

      expect(replay.projection.currentNode).toBe(fixture.expected.currentNode);
      expect(replay.projection.data.trackerState).toBe(
        fixture.expected.trackerState
      );
      expect(replay.projection.data.lastDispatchMode).toBe(
        fixture.expected.lastDispatchMode
      );
      expect(replay.projection.data.lastRunMode).toBe(
        fixture.expected.lastRunMode
      );
      expect(replay.projection.data.lastRuntimeOutcome).toBe(
        fixture.expected.lastRuntimeOutcome
      );
      expect(replay.projection.data.latestReworkHandoff).toEqual(
        fixture.expected.latestReworkHandoff ?? null
      );
      expect(replay.projection.pendingCommands).toBe(0);
      expect(replay.results).toHaveLength(fixture.signals.length);
      expect(replay.historyLength).toBeGreaterThan(fixture.signals.length);
    }
  );

  it("claims Todo work into Bootstrapping and dispatches implementation work", async () => {
    const replay = await replaySymphonyCurrentFlowFixture(
      symphonyCurrentFlowReplayFixtures[0]!
    );
    const firstStep = replay.results[0]!;

    expect(firstStep.decision.fromNode).toBe("idle");
    expect(firstStep.decision.toNode).toBe("bootstrapping");
    expect(firstStep.decision.reasonCode).toBe("todo_claimed_for_dispatch");
    expect(firstStep.decision.commands).toEqual([
      {
        id: "command_signal_todo_observed_tracker_bootstrapping",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Bootstrapping"
        }
      },
      {
        id: "command_signal_todo_observed_dispatch_implementation",
        kind: "run.dispatch",
        dedupeKey: null,
        payload: {
          runMode: "implementation"
        }
      }
    ]);
  });

  it("takes over an implementation run when the issue is moved to Approved", async () => {
    const router = await createSymphonyCurrentFlowRouterAsync({
      now: () => new Date("2026-04-09T22:45:00.000Z"),
      createId: (() => {
        let counter = 0;
        return (prefix: string) =>
          `${prefix}_${String(++counter).padStart(4, "0")}`;
      })()
    });

    const history = [
      {
        kind: "signal_recorded" as const,
        recordedAt: "2026-04-09T22:40:00.000Z",
        signal: {
          id: "signal_todo_observed",
          type: "tracker.state_observed",
          source: "tracker" as const,
          occurredAt: "2026-04-09T22:40:00.000Z",
          payload: {
            state: "Todo",
            runId: null,
            runMode: null
          },
          causationId: null,
          correlationId: null
        }
      },
      {
        kind: "decision_recorded" as const,
        recordedAt: "2026-04-09T22:40:00.000Z",
        decision: {
          id: "decision_0001",
          fromNode: "idle" as SymphonyCurrentFlowNode,
          toNode: "bootstrapping" as SymphonyCurrentFlowNode,
          edgeId: "idle_todo_to_bootstrapping",
          reasonCode: "todo_claimed_for_dispatch",
          commands: [
            {
              id: "command_signal_todo_observed_tracker_bootstrapping",
              kind: "tracker.transition",
              dedupeKey: null,
              payload: {
                state: "Bootstrapping"
              }
            },
            {
              id: "command_signal_todo_observed_dispatch_implementation",
              kind: "run.dispatch",
              dedupeKey: null,
              payload: {
                runMode: "implementation"
              }
            }
          ],
          trace: [],
          selectionMetadata: null
        }
      },
      {
        kind: "command_emitted" as const,
        decisionId: "decision_0001",
        recordedAt: "2026-04-09T22:40:00.000Z",
        command: {
          id: "command_signal_todo_observed_tracker_bootstrapping",
          kind: "tracker.transition",
          dedupeKey: null,
          payload: {
            state: "Bootstrapping"
          }
        }
      },
      {
        kind: "command_emitted" as const,
        decisionId: "decision_0001",
        recordedAt: "2026-04-09T22:40:00.000Z",
        command: {
          id: "command_signal_todo_observed_dispatch_implementation",
          kind: "run.dispatch",
          dedupeKey: null,
          payload: {
            runMode: "implementation"
          }
        }
      },
      {
        kind: "command_settled" as const,
        commandId: "command_signal_todo_observed_tracker_bootstrapping",
        recordedAt: "2026-04-09T22:40:01.000Z",
        status: "succeeded" as const,
        payload: null
      },
      {
        kind: "command_settled" as const,
        commandId: "command_signal_todo_observed_dispatch_implementation",
        recordedAt: "2026-04-09T22:40:01.000Z",
        status: "succeeded" as const,
        payload: null
      },
      {
        kind: "signal_recorded" as const,
        recordedAt: "2026-04-09T22:40:02.000Z",
        signal: {
          id: "signal_implementation_started",
          type: "runtime.run_started",
          source: "runtime" as const,
          occurredAt: "2026-04-09T22:40:02.000Z",
          payload: {
            runId: null,
            runMode: "implementation"
          },
          causationId: null,
          correlationId: null
        }
      },
      {
        kind: "decision_recorded" as const,
        recordedAt: "2026-04-09T22:40:02.000Z",
        decision: {
          id: "decision_0002",
          fromNode: "bootstrapping" as SymphonyCurrentFlowNode,
          toNode: "implementation" as SymphonyCurrentFlowNode,
          edgeId: "bootstrapping_to_implementation_started",
          reasonCode: "implementation_run_started",
          commands: [
            {
              id: "command_signal_implementation_started_tracker_in_progress",
              kind: "tracker.transition",
              dedupeKey: null,
              payload: {
                state: "In Progress"
              }
            }
          ],
          trace: [],
          selectionMetadata: null
        }
      },
      {
        kind: "command_emitted" as const,
        decisionId: "decision_0002",
        recordedAt: "2026-04-09T22:40:02.000Z",
        command: {
          id: "command_signal_implementation_started_tracker_in_progress",
          kind: "tracker.transition",
          dedupeKey: null,
          payload: {
            state: "In Progress"
          }
        }
      },
      {
        kind: "command_settled" as const,
        commandId: "command_signal_implementation_started_tracker_in_progress",
        recordedAt: "2026-04-09T22:40:03.000Z",
        status: "succeeded" as const,
        payload: null
      }
    ];

    const result = await Effect.runPromise(
      router.receive({
        workflowId: "SYM-207",
        history,
        signal: {
          id: "signal_approved_observed",
          type: "tracker.state_observed",
          source: "tracker",
          occurredAt: "2026-04-09T22:45:00.000Z",
          payload: {
            state: "Approved",
            runId: null,
            runMode: null
          },
          causationId: null,
          correlationId: null
        },
        policy: {}
      })
    );

    expect(result.decision.toNode).toBe("approved_merge");
    expect(result.decision.reasonCode).toBe("approved_merge_takeover");
    expect(result.decision.commands).toEqual([]);
    expect(result.projectionAfter.data.lastDispatchMode).toBe("implementation");
  });

  it("re-dispatches bootstrapping work when Bootstrapping is observed again after resume", async () => {
    const router = await createSymphonyCurrentFlowRouterAsync({
      now: () => new Date("2026-04-09T22:50:00.000Z"),
      createId: (() => {
        let counter = 0;
        return (prefix: string) =>
          `${prefix}_${String(++counter).padStart(4, "0")}`;
      })()
    });

    const session = await router.resumeSessionAsync({
      projection: {
        workflowId: "SYM-208",
        currentNode: "bootstrapping",
        pendingCommands: [],
        recordedSignalIds: ["signal_todo_observed"],
        emittedCommandIds: [
          "command_signal_todo_observed_tracker_bootstrapping",
          "command_signal_todo_observed_dispatch_implementation"
        ],
        terminal: false,
        sequence: 6,
        data: {
          trackerState: "Bootstrapping",
          lastObservedTrackerState: "Todo",
          lastDispatchMode: "implementation",
          lastRunMode: null,
          lastRuntimeOutcome: null,
          latestReworkHandoff: null
        },
        lastSignal: {
          id: "signal_todo_observed",
          type: "tracker.state_observed",
          source: "tracker",
          occurredAt: "2026-04-09T22:40:00.000Z",
          payload: {
            state: "Todo",
            runId: null,
            runMode: null
          },
          causationId: null,
          correlationId: null
        },
        lastDecision: {
          id: "decision_0001",
          fromNode: "idle" as SymphonyCurrentFlowNode,
          toNode: "bootstrapping" as SymphonyCurrentFlowNode,
          edgeId: "idle_todo_to_bootstrapping",
          reasonCode: "todo_claimed_for_dispatch",
          commands: [],
          trace: [],
          selectionMetadata: null
        }
      },
      history: [],
      policy: {}
    });

    const result = await session.receiveAsync({
      id: "signal_bootstrapping_reobserved",
      type: "tracker.state_observed",
      source: "tracker",
      occurredAt: "2026-04-09T22:50:00.000Z",
      payload: {
        state: "Bootstrapping",
        runId: null,
        runMode: null
      },
      causationId: null,
      correlationId: null
    });

    expect(result.decision.toNode).toBe("bootstrapping");
    expect(result.decision.reasonCode).toBe("bootstrapping_redispatched");
    expect(result.decision.commands).toEqual([
      {
        id: "command_signal_bootstrapping_reobserved_dispatch_implementation",
        kind: "run.dispatch",
        dedupeKey: null,
        payload: {
          runMode: "implementation"
        }
      }
    ]);
  });

  it("reopens paused work back into bootstrapping when Todo is observed again", async () => {
    const router = await createSymphonyCurrentFlowRouterAsync({
      now: () => new Date("2026-04-09T23:00:00.000Z"),
      createId: (() => {
        let counter = 0;
        return (prefix: string) =>
          `${prefix}_${String(++counter).padStart(4, "0")}`;
      })()
    });

    const result = await Effect.runPromise(
      router.receive({
        workflowId: "SYM-209",
        history: [
          {
            kind: "signal_recorded",
            recordedAt: "2026-04-09T22:55:00.000Z",
            signal: {
              id: "signal_paused_observed",
              type: "tracker.state_observed",
              source: "tracker",
              occurredAt: "2026-04-09T22:55:00.000Z",
              payload: {
                state: "Paused",
                runId: null,
                runMode: null
              },
              causationId: null,
              correlationId: null
            }
          },
          {
            kind: "decision_recorded",
            recordedAt: "2026-04-09T22:55:00.000Z",
            decision: {
              id: "decision_0001",
              fromNode: "idle" as SymphonyCurrentFlowNode,
              toNode: "paused" as SymphonyCurrentFlowNode,
              edgeId: "implementation_paused",
              reasonCode: "implementation_paused",
              commands: [],
              trace: [],
              selectionMetadata: null
            }
          }
        ],
        signal: {
          id: "signal_todo_reopened",
          type: "tracker.state_observed",
          source: "tracker",
          occurredAt: "2026-04-09T23:00:00.000Z",
          payload: {
            state: "Todo",
            runId: null,
            runMode: null
          },
          causationId: null,
          correlationId: null
        },
        policy: {}
      })
    );

    expect(result.decision.toNode).toBe("bootstrapping");
    expect(result.decision.reasonCode).toBe("paused_reopened_from_todo");
    expect(result.decision.commands).toEqual([
      {
        id: "command_signal_todo_reopened_tracker_bootstrapping",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Bootstrapping"
        }
      },
      {
        id: "command_signal_todo_reopened_dispatch_implementation",
        kind: "run.dispatch",
        dedupeKey: null,
        payload: {
          runMode: "implementation"
        }
      }
    ]);
  });

  it("routes shutdown requests into paused from implementation", async () => {
    const router = await createSymphonyCurrentFlowRouterAsync({
      now: () => new Date("2026-04-09T23:05:00.000Z"),
      createId: (() => {
        let counter = 0;
        return (prefix: string) =>
          `${prefix}_${String(++counter).padStart(4, "0")}`;
      })()
    });

    const result = await Effect.runPromise(
      router.receive({
        workflowId: "SYM-210",
        history: [
          {
            kind: "signal_recorded",
            recordedAt: "2026-04-09T23:00:00.000Z",
            signal: {
              id: "signal_bootstrapping",
              type: "tracker.state_observed",
              source: "tracker",
              occurredAt: "2026-04-09T23:00:00.000Z",
              payload: {
                state: "Bootstrapping",
                runId: null,
                runMode: null
              },
              causationId: null,
              correlationId: "SYM-210"
            }
          },
          {
            kind: "decision_recorded",
            recordedAt: "2026-04-09T23:00:00.000Z",
            decision: {
              id: "decision_0001",
              fromNode: "idle" as SymphonyCurrentFlowNode,
              toNode: "bootstrapping" as SymphonyCurrentFlowNode,
              edgeId: "idle_bootstrapping_to_bootstrapping",
              reasonCode: "bootstrapping_resumed",
              commands: [],
              trace: [],
              selectionMetadata: null
            }
          },
          {
            kind: "signal_recorded",
            recordedAt: "2026-04-09T23:01:00.000Z",
            signal: {
              id: "signal_run_started",
              type: "runtime.run_started",
              source: "runtime",
              occurredAt: "2026-04-09T23:01:00.000Z",
              payload: {
                runId: "run-210",
                runMode: "implementation"
              },
              causationId: "run-210",
              correlationId: "SYM-210"
            }
          },
          {
            kind: "decision_recorded",
            recordedAt: "2026-04-09T23:01:00.000Z",
            decision: {
              id: "decision_0002",
              fromNode: "bootstrapping" as SymphonyCurrentFlowNode,
              toNode: "implementation" as SymphonyCurrentFlowNode,
              edgeId: "bootstrapping_to_implementation_started",
              reasonCode: "implementation_run_started",
              commands: [
                {
                  id: "command_signal_run_started_tracker_in_progress",
                  kind: "tracker.transition",
                  dedupeKey: null,
                  payload: {
                    state: "In Progress"
                  }
                }
              ],
              trace: [],
              selectionMetadata: null
            }
          }
        ],
        signal: {
          id: "signal_shutdown_requested",
          type: "runtime.shutdown_requested",
          source: "runtime",
          occurredAt: "2026-04-09T23:05:00.000Z",
          payload: {
            runId: "run-210",
            runMode: "implementation",
            reason: "runtime_shutdown"
          },
          causationId: "run-210",
          correlationId: "SYM-210"
        },
        policy: {}
      })
    );

    expect(result.decision.toNode).toBe("paused");
    expect(result.decision.reasonCode).toBe("implementation_shutdown_paused");
    expect(result.decision.commands).toEqual([
      {
        id: "command_signal_shutdown_requested_tracker_paused",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Paused"
        }
      }
    ]);
  });

  it("routes delivery reports through an explicit runtime signal before review is observed", async () => {
    const fixture = symphonyCurrentFlowReplayFixtures.find(
      (candidate) => candidate.name === "implementation_delivery_reported_to_review"
    );
    if (!fixture) {
      throw new TypeError("Missing implementation delivery replay fixture.");
    }

    const replay = await replaySymphonyCurrentFlowFixture(fixture);
    const deliveryStep = replay.results[2];

    expect(deliveryStep?.decision.fromNode).toBe("implementation");
    expect(deliveryStep?.decision.toNode).toBe("review");
    expect(deliveryStep?.decision.reasonCode).toBe("delivery_reported");
    expect(deliveryStep?.decision.commands).toEqual([
      {
        id: "command_signal_delivery_reported_tracker_in_review",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "In Review"
        }
      }
    ]);
  });

  it("routes explicit review rework requests through workflow history before tracker observation catches up", async () => {
    const fixture = symphonyCurrentFlowReplayFixtures.find(
      (candidate) => candidate.name === "review_rework_requested_to_bootstrapping"
    );
    if (!fixture) {
      throw new TypeError("Missing review rework requested replay fixture.");
    }

    const replay = await replaySymphonyCurrentFlowFixture(fixture);
    const requestStep = replay.results[1];

    expect(requestStep?.decision.fromNode).toBe("review");
    expect(requestStep?.decision.toNode).toBe("bootstrapping");
    expect(requestStep?.decision.reasonCode).toBe("review_requested_rework");
    expect(requestStep?.decision.commands).toEqual([
      {
        id: "command_signal_review_rework_requested_tracker_rework",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Rework"
        }
      },
      {
        id: "command_signal_review_rework_requested_tracker_bootstrapping",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Bootstrapping"
        }
      },
      {
        id: "command_signal_review_rework_requested_dispatch_rework",
        kind: "run.dispatch",
        dedupeKey: null,
        payload: {
          runMode: "rework"
        }
      }
    ]);
  });

  it("routes blocked delivery reports through workflow history before runtime completion settles", async () => {
    const fixture = symphonyCurrentFlowReplayFixtures.find(
      (candidate) => candidate.name === "implementation_delivery_reported_blocked"
    );
    if (!fixture) {
      throw new TypeError("Missing blocked delivery replay fixture.");
    }

    const replay = await replaySymphonyCurrentFlowFixture(fixture);
    const deliveryStep = replay.results[2];

    expect(deliveryStep?.decision.fromNode).toBe("implementation");
    expect(deliveryStep?.decision.toNode).toBe("blocked");
    expect(deliveryStep?.decision.reasonCode).toBe("implementation_delivery_blocked");
    expect(deliveryStep?.decision.commands).toEqual([
      {
        id: "command_signal_delivery_blocked_tracker_blocked",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Blocked"
        }
      }
    ]);
  });

  it("routes requested paused states through an explicit runtime signal", async () => {
    const fixture = symphonyCurrentFlowReplayFixtures.find(
      (candidate) => candidate.name === "implementation_state_requested_paused"
    );
    if (!fixture) {
      throw new TypeError("Missing implementation paused state-request replay fixture.");
    }

    const replay = await replaySymphonyCurrentFlowFixture(fixture);
    const requestStep = replay.results[2];

    expect(requestStep?.decision.fromNode).toBe("implementation");
    expect(requestStep?.decision.toNode).toBe("paused");
    expect(requestStep?.decision.reasonCode).toBe(
      "implementation_state_requested_paused"
    );
    expect(requestStep?.decision.commands).toEqual([
      {
        id: "command_signal_spike_result_requested_tracker_paused",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Paused"
        }
      }
    ]);
  });

  it("routes requested canceled states through an explicit runtime signal", async () => {
    const fixture = symphonyCurrentFlowReplayFixtures.find(
      (candidate) => candidate.name === "implementation_state_requested_canceled"
    );
    if (!fixture) {
      throw new TypeError(
        "Missing implementation canceled state-request replay fixture."
      );
    }

    const replay = await replaySymphonyCurrentFlowFixture(fixture);
    const requestStep = replay.results[2];

    expect(requestStep?.decision.fromNode).toBe("implementation");
    expect(requestStep?.decision.toNode).toBe("canceled");
    expect(requestStep?.decision.reasonCode).toBe(
      "implementation_state_requested_canceled"
    );
    expect(requestStep?.decision.commands).toEqual([
      {
        id: "command_signal_cancel_requested_tracker_canceled",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Canceled"
        }
      }
    ]);
  });

  it("routes merge-result reports through an explicit runtime signal before runtime completion is observed", async () => {
    const fixture = symphonyCurrentFlowReplayFixtures.find(
      (candidate) => candidate.name === "approved_merge_merge_result_reported_done"
    );
    if (!fixture) {
      throw new TypeError("Missing approved merge done replay fixture.");
    }

    const replay = await replaySymphonyCurrentFlowFixture(fixture);
    const mergeResultStep = replay.results[2];

    expect(mergeResultStep?.decision.fromNode).toBe("approved_merge");
    expect(mergeResultStep?.decision.toNode).toBe("done");
    expect(mergeResultStep?.decision.reasonCode).toBe("merge_result_reported");
    expect(mergeResultStep?.decision.commands).toEqual([
      {
        id: "command_signal_merge_result_done_tracker_done",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Done"
        }
      }
    ]);
  });

  it("routes blocked merge-result reports through an explicit runtime signal", async () => {
    const fixture = symphonyCurrentFlowReplayFixtures.find(
      (candidate) =>
        candidate.name === "approved_merge_merge_result_reported_blocked"
    );
    if (!fixture) {
      throw new TypeError("Missing approved merge blocked replay fixture.");
    }

    const replay = await replaySymphonyCurrentFlowFixture(fixture);
    const mergeResultStep = replay.results[2];

    expect(mergeResultStep?.decision.fromNode).toBe("approved_merge");
    expect(mergeResultStep?.decision.toNode).toBe("blocked");
    expect(mergeResultStep?.decision.reasonCode).toBe(
      "merge_result_blocked_reported"
    );
    expect(mergeResultStep?.decision.commands).toEqual([
      {
        id: "command_signal_merge_result_blocked_tracker_blocked",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Blocked"
        }
      }
    ]);
  });
});
