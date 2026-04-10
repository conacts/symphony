import type { WorkflowRouteResult, WorkflowSignal } from "../types/index.js";
import { createSymphonyCurrentFlowRouterAsync } from "../symphony-current-flow-router.js";
import type {
  SymphonyCurrentFlowCompletionKind,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowPolicy,
  SymphonyCurrentFlowRunMode,
  SymphonyCurrentFlowTrackerState
} from "../symphony-current-flow-router.js";

export type SymphonyCurrentFlowReplayFixture = {
  name: string;
  description: string;
  workflowId: string;
  signals: ReadonlyArray<WorkflowSignal>;
  expected: {
    currentNode: SymphonyCurrentFlowNode;
    trackerState: SymphonyCurrentFlowTrackerState | null;
    lastDispatchMode: SymphonyCurrentFlowRunMode | null;
    lastRunMode: SymphonyCurrentFlowRunMode | null;
    lastRuntimeOutcome: SymphonyCurrentFlowCompletionKind | null;
  };
};

export type SymphonyCurrentFlowReplayResult = {
  fixture: SymphonyCurrentFlowReplayFixture;
  results: WorkflowRouteResult<SymphonyCurrentFlowNode, SymphonyCurrentFlowData>[];
  projection: {
    currentNode: SymphonyCurrentFlowNode | null;
    pendingCommands: number;
    data: SymphonyCurrentFlowData;
  };
  historyLength: number;
};

export const symphonyCurrentFlowReplayFixtures: ReadonlyArray<SymphonyCurrentFlowReplayFixture> = [
  {
    name: "todo_to_review",
    description:
      "Todo work is claimed into Bootstrapping, activated into implementation, and finishes in review.",
    workflowId: "SYM-201",
    signals: [
      observeTrackerState("signal_todo_observed", "Todo", 0),
      runtimeRunStarted("signal_implementation_started", "implementation", 1),
      observeTrackerState("signal_review_observed", "In Review", 2)
    ],
    expected: {
      currentNode: "review",
      trackerState: "In Review",
      lastDispatchMode: "implementation",
      lastRunMode: "implementation",
      lastRuntimeOutcome: null
    }
  },
  {
    name: "review_rework_loop",
    description:
      "Review feedback moves the issue into Rework, claims it again, and activates a rework run.",
    workflowId: "SYM-202",
    signals: [
      observeTrackerState("signal_review_observed", "In Review", 0),
      observeTrackerState("signal_rework_observed", "Rework", 1),
      runtimeRunStarted("signal_rework_started", "rework", 2),
      observeTrackerState("signal_review_returned", "In Review", 3)
    ],
    expected: {
      currentNode: "review",
      trackerState: "In Review",
      lastDispatchMode: "rework",
      lastRunMode: "rework",
      lastRuntimeOutcome: null
    }
  },
  {
    name: "approved_merge_done",
    description:
      "Approved issues dispatch merge automation, enter In Progress, and land in Done when merged.",
    workflowId: "SYM-203",
    signals: [
      observeTrackerState("signal_approved_observed", "Approved", 0),
      runtimeRunStarted("signal_merge_started", "approved_merge", 1),
      runtimeCompleted("signal_merge_completed", "merged", 2)
    ],
    expected: {
      currentNode: "done",
      trackerState: "Done",
      lastDispatchMode: "approved_merge",
      lastRunMode: "approved_merge",
      lastRuntimeOutcome: "merged"
    }
  },
  {
    name: "startup_failure_to_failed",
    description:
      "Bootstrapping startup failures terminate the workflow in Failed.",
    workflowId: "SYM-204",
    signals: [
      observeTrackerState("signal_todo_observed", "Todo", 0),
      runtimeStartupFailure("signal_startup_failed", 1)
    ],
    expected: {
      currentNode: "failed",
      trackerState: "Failed",
      lastDispatchMode: "implementation",
      lastRunMode: null,
      lastRuntimeOutcome: "startup_failure"
    }
  },
  {
    name: "implementation_failure_to_paused",
    description:
      "Implementation failures pause the issue instead of pushing it to a merge or done state.",
    workflowId: "SYM-205",
    signals: [
      observeTrackerState("signal_todo_observed", "Todo", 0),
      runtimeRunStarted("signal_implementation_started", "implementation", 1),
      runtimeCompleted("signal_runtime_failed", "failure", 2)
    ],
    expected: {
      currentNode: "paused",
      trackerState: "Paused",
      lastDispatchMode: "implementation",
      lastRunMode: "implementation",
      lastRuntimeOutcome: "failure"
    }
  },
  {
    name: "merge_blocked_to_blocked",
    description:
      "Approved merge failures stop in Blocked rather than being treated like a normal paused implementation run.",
    workflowId: "SYM-206",
    signals: [
      observeTrackerState("signal_approved_observed", "Approved", 0),
      runtimeRunStarted("signal_merge_started", "approved_merge", 1),
      runtimeCompleted("signal_merge_blocked", "merge_blocked", 2)
    ],
    expected: {
      currentNode: "blocked",
      trackerState: "Blocked",
      lastDispatchMode: "approved_merge",
      lastRunMode: "approved_merge",
      lastRuntimeOutcome: "merge_blocked"
    }
  }
];

export async function replaySymphonyCurrentFlowFixture(
  fixture: SymphonyCurrentFlowReplayFixture,
  policy: SymphonyCurrentFlowPolicy = {}
): Promise<SymphonyCurrentFlowReplayResult> {
  const router = await createSymphonyCurrentFlowRouterAsync(
    createFixedRouterOptions()
  );
  const session = await router.startSessionAsync({
    workflowId: fixture.workflowId,
    policy
  });

  const results: WorkflowRouteResult<
    SymphonyCurrentFlowNode,
    SymphonyCurrentFlowData
  >[] = [];

  for (const signal of fixture.signals) {
    const result = await session.receiveAsync(signal);
    results.push(result);

    for (const command of result.decision.commands) {
      await session.settleCommandAsync({
        commandId: command.id,
        status: "succeeded",
        recordedAt: `${signal.occurredAt ?? "2026-04-09T00:00:00.000Z"}`
      });
    }
  }

  const projection = session.projection();
  return {
    fixture,
    results,
    projection: {
      currentNode: projection.currentNode,
      pendingCommands: projection.pendingCommands.length,
      data: projection.data
    },
    historyLength: session.history().length
  };
}

function observeTrackerState(
  id: string,
  state: SymphonyCurrentFlowTrackerState,
  step: number
): WorkflowSignal {
  return createSignal(id, step, "tracker.state_observed", "tracker", {
    state
  });
}

function runtimeRunStarted(
  id: string,
  runMode: SymphonyCurrentFlowRunMode,
  step: number
): WorkflowSignal {
  return createSignal(id, step, "runtime.run_started", "runtime", {
    runMode
  });
}

function runtimeCompleted(
  id: string,
  kind: Exclude<SymphonyCurrentFlowCompletionKind, "startup_failure">,
  step: number
): WorkflowSignal {
  return createSignal(id, step, "runtime.completed", "runtime", {
    kind
  });
}

function runtimeStartupFailure(
  id: string,
  step: number
): WorkflowSignal {
  return createSignal(id, step, "runtime.startup_failure", "runtime", {
    kind: "startup_failure"
  });
}

function createSignal(
  id: string,
  step: number,
  type: string,
  source: WorkflowSignal["source"],
  payload: NonNullable<WorkflowSignal["payload"]>
): WorkflowSignal {
  return {
    id,
    type,
    source,
    occurredAt: buildOccurredAt(step),
    payload
  };
}

function buildOccurredAt(step: number): string {
  return new Date(Date.UTC(2026, 3, 9, 22, 0, step)).toISOString();
}

function createFixedRouterOptions() {
  let counter = 0;
  return {
    now: () => new Date(Date.UTC(2026, 3, 9, 22, 30, counter)),
    createId: (prefix: string) => `${prefix}_${String(++counter).padStart(4, "0")}`
  };
}
