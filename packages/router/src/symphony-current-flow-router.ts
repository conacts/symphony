import {
  createWorkflowRouter,
  createWorkflowRouterAsync
} from "./router-builder.js";
import { createDeterministicStrategy } from "./router-deterministic-strategy.js";
import type { WorkflowRouterDefinition } from "./router-definition.js";
import { WorkflowEdge } from "./router-edge.js";
import { WorkflowNode } from "./router-node.js";
import type { WorkflowRouterOptions } from "./workflow-router.js";
import type { WorkflowPayload, WorkflowSignal } from "./types/index.js";

export type SymphonyCurrentFlowNode =
  | "idle"
  | "bootstrapping"
  | "implementation"
  | "rework"
  | "review"
  | "approved_merge"
  | "done"
  | "paused"
  | "blocked"
  | "failed";

export type SymphonyCurrentFlowTrackerState =
  | "Todo"
  | "Bootstrapping"
  | "In Progress"
  | "In Review"
  | "Rework"
  | "Approved"
  | "Done"
  | "Paused"
  | "Blocked"
  | "Failed";

export type SymphonyCurrentFlowRunMode =
  | "implementation"
  | "rework"
  | "approved_merge";

export type SymphonyCurrentFlowCompletionKind =
  | "merged"
  | "blocked"
  | "merge_blocked"
  | "max_turns_reached"
  | "rate_limited"
  | "provider_transient"
  | "stalled"
  | "failure"
  | "startup_failure";

export type SymphonyCurrentFlowPolicy = Record<string, never>;

export type SymphonyCurrentFlowData = {
  trackerState: SymphonyCurrentFlowTrackerState | null;
  lastObservedTrackerState: SymphonyCurrentFlowTrackerState | null;
  lastDispatchMode: SymphonyCurrentFlowRunMode | null;
  lastRunMode: SymphonyCurrentFlowRunMode | null;
  lastRuntimeOutcome: SymphonyCurrentFlowCompletionKind | null;
};

export function createSymphonyCurrentFlowRouterDefinition(): WorkflowRouterDefinition<
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
> {
  return {
    name: "symphony-current-flow",
    version: "1",
    initialNode: "idle",
    nodes: [
      new WorkflowNode("idle"),
      new WorkflowNode("bootstrapping", {
        enter: ({ signal }) => buildBootstrappingEnterCommands(signal)
      }),
      new WorkflowNode("implementation", {
        enter: ({ signal }) =>
          shouldTransitionToInProgress(signal, "implementation")
            ? [createTrackerTransitionCommand(signal, "In Progress")]
            : []
      }),
      new WorkflowNode("rework", {
        enter: ({ signal }) =>
          shouldTransitionToInProgress(signal, "rework")
            ? [createTrackerTransitionCommand(signal, "In Progress")]
            : []
      }),
      new WorkflowNode("review"),
      new WorkflowNode("approved_merge", {
        enter: (context) =>
          shouldDispatchApprovedMergeOnEnter(context)
            ? [createDispatchCommand(context.signal, "approved_merge")]
            : []
      }),
      new WorkflowNode("done", {
        terminal: true,
        enter: ({ signal }) =>
          maybeCreateTrackerTransitionCommand(signal, "Done")
      }),
      new WorkflowNode("paused", {
        terminal: true,
        enter: ({ signal }) =>
          maybeCreateTrackerTransitionCommand(signal, "Paused")
      }),
      new WorkflowNode("blocked", {
        terminal: true,
        enter: ({ signal }) =>
          maybeCreateTrackerTransitionCommand(signal, "Blocked")
      }),
      new WorkflowNode("failed", {
        terminal: true,
        enter: ({ signal }) =>
          maybeCreateTrackerTransitionCommand(signal, "Failed")
      })
    ],
    edges: [
      new WorkflowEdge({
        id: "idle_todo_to_bootstrapping",
        from: "idle",
        to: "bootstrapping",
        reasonCode: "todo_claimed_for_dispatch",
        guard: ({ signal }) => isObservedTrackerState(signal, "Todo")
      }),
      new WorkflowEdge({
        id: "idle_rework_to_bootstrapping",
        from: "idle",
        to: "bootstrapping",
        reasonCode: "rework_claimed_for_dispatch",
        guard: ({ signal }) => isObservedTrackerState(signal, "Rework")
      }),
      new WorkflowEdge({
        id: "idle_bootstrapping_to_bootstrapping",
        from: "idle",
        to: "bootstrapping",
        reasonCode: "bootstrapping_resumed",
        guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping")
      }),
      new WorkflowEdge({
        id: "bootstrapping_bootstrapping_to_bootstrapping",
        from: "bootstrapping",
        to: "bootstrapping",
        reasonCode: "bootstrapping_redispatched",
        guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping"),
        commands: (context) => buildBootstrappingRedispatchCommands(context)
      }),
      new WorkflowEdge({
        id: "idle_review_to_review",
        from: "idle",
        to: "review",
        reasonCode: "review_observed",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Review")
      }),
      new WorkflowEdge({
        id: "idle_approved_to_approved_merge",
        from: "idle",
        to: "approved_merge",
        reasonCode: "approved_merge_requested",
        guard: ({ signal }) => isObservedTrackerState(signal, "Approved")
      }),
      new WorkflowEdge({
        id: "approved_merge_approved_to_approved_merge",
        from: "approved_merge",
        to: "approved_merge",
        reasonCode: "approved_merge_redispatched",
        guard: ({ signal }) => isObservedTrackerState(signal, "Approved"),
        commands: ({ signal }) => [createDispatchCommand(signal, "approved_merge")]
      }),
      new WorkflowEdge({
        id: "review_rework_to_bootstrapping",
        from: "review",
        to: "bootstrapping",
        reasonCode: "review_requested_rework",
        guard: ({ signal }) => isObservedTrackerState(signal, "Rework")
      }),
      ...buildTerminalReentryEdges("done"),
      ...buildTerminalReentryEdges("paused"),
      ...buildTerminalReentryEdges("blocked"),
      ...buildTerminalReentryEdges("failed"),
      new WorkflowEdge({
        id: "review_approved_to_approved_merge",
        from: "review",
        to: "approved_merge",
        reasonCode: "review_approved_for_merge",
        guard: ({ signal }) => isObservedTrackerState(signal, "Approved")
      }),
      new WorkflowEdge({
        id: "bootstrapping_to_implementation_started",
        from: "bootstrapping",
        to: "implementation",
        reasonCode: "implementation_run_started",
        guard: ({ signal }) => isRunStarted(signal, "implementation")
      }),
      new WorkflowEdge({
        id: "bootstrapping_to_rework_started",
        from: "bootstrapping",
        to: "rework",
        reasonCode: "rework_run_started",
        guard: ({ signal }) => isRunStarted(signal, "rework")
      }),
      new WorkflowEdge({
        id: "bootstrapping_to_failed_startup_failure",
        from: "bootstrapping",
        to: "failed",
        reasonCode: "startup_failure",
        guard: ({ signal }) => signal.type === "runtime.startup_failure"
      }),
      new WorkflowEdge({
        id: "implementation_to_review",
        from: "implementation",
        to: "review",
        reasonCode: "delivery_recorded",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Review")
      }),
      new WorkflowEdge({
        id: "rework_to_review",
        from: "rework",
        to: "review",
        reasonCode: "rework_delivery_recorded",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Review")
      }),
      ...buildObservedStateTerminalEdges("implementation"),
      ...buildObservedStateTerminalEdges("rework"),
      ...buildObservedStateTerminalEdges("approved_merge"),
      new WorkflowEdge({
        id: "implementation_to_approved_merge_takeover",
        from: "implementation",
        to: "approved_merge",
        reasonCode: "approved_merge_takeover",
        guard: ({ signal }) => isObservedTrackerState(signal, "Approved")
      }),
      new WorkflowEdge({
        id: "approved_merge_started",
        from: "approved_merge",
        to: "approved_merge",
        reasonCode: "approved_merge_started",
        guard: ({ signal }) => isRunStarted(signal, "approved_merge"),
        commands: ({ signal }) => [createTrackerTransitionCommand(signal, "In Progress")]
      }),
      new WorkflowEdge({
        id: "approved_merge_done",
        from: "approved_merge",
        to: "done",
        reasonCode: "merge_completed",
        guard: ({ signal }) => hasCompletionKind(signal, "merged")
      }),
      new WorkflowEdge({
        id: "approved_merge_blocked",
        from: "approved_merge",
        to: "blocked",
        reasonCode: "merge_blocked",
        guard: ({ signal }) => isBlockedMergeOutcome(signal)
      }),
      new WorkflowEdge({
        id: "implementation_blocked",
        from: "implementation",
        to: "blocked",
        reasonCode: "implementation_blocked",
        guard: ({ signal }) => hasCompletionKind(signal, "blocked")
      }),
      new WorkflowEdge({
        id: "rework_blocked",
        from: "rework",
        to: "blocked",
        reasonCode: "rework_blocked",
        guard: ({ signal }) => hasCompletionKind(signal, "blocked")
      }),
      new WorkflowEdge({
        id: "implementation_paused",
        from: "implementation",
        to: "paused",
        reasonCode: "implementation_paused",
        guard: ({ signal }) => isPausedOutcome(signal)
      }),
      new WorkflowEdge({
        id: "rework_paused",
        from: "rework",
        to: "paused",
        reasonCode: "rework_paused",
        guard: ({ signal }) => isPausedOutcome(signal)
      })
    ],
    strategy: createDeterministicStrategy(),
    createInitialData: () => ({
      trackerState: null,
      lastObservedTrackerState: null,
      lastDispatchMode: null,
      lastRunMode: null,
      lastRuntimeOutcome: null
    }),
    reduceData: ({ data, event }) => {
      if (event.kind === "signal_recorded") {
        if (event.signal.type === "tracker.state_observed") {
          const trackerState = readTrackerState(event.signal.payload);
          if (trackerState !== null) {
            return {
              ...data,
              trackerState,
              lastObservedTrackerState: trackerState
            };
          }
        }

        if (event.signal.type === "runtime.run_started") {
          const lastRunMode = readRunMode(event.signal.payload);
          if (lastRunMode !== null) {
            return {
              ...data,
              lastRunMode
            };
          }
        }

        if (event.signal.type === "runtime.completed") {
          const lastRuntimeOutcome = readCompletionKind(event.signal.payload);
          if (lastRuntimeOutcome !== null) {
            return {
              ...data,
              lastRuntimeOutcome
            };
          }
        }

        if (event.signal.type === "runtime.startup_failure") {
          return {
            ...data,
            lastRuntimeOutcome: "startup_failure"
          };
        }
      }

      if (event.kind === "command_emitted") {
        if (event.command.kind === "tracker.transition") {
          const trackerState = readTrackerState(event.command.payload);
          if (trackerState !== null) {
            return {
              ...data,
              trackerState
            };
          }
        }

        if (event.command.kind === "run.dispatch") {
          const lastDispatchMode = readRunMode(event.command.payload);
          if (lastDispatchMode !== null) {
            return {
              ...data,
              lastDispatchMode
            };
          }
        }
      }

      return data;
    }
  };
}

export function createSymphonyCurrentFlowRouter(
  options: WorkflowRouterOptions = {}
) {
  return createWorkflowRouter(
    createSymphonyCurrentFlowRouterDefinition(),
    options
  );
}

export async function createSymphonyCurrentFlowRouterAsync(
  options: WorkflowRouterOptions = {}
) {
  return await createWorkflowRouterAsync(
    createSymphonyCurrentFlowRouterDefinition(),
    options
  );
}

function buildBootstrappingEnterCommands(
  signal: WorkflowSignal
) {
  const observedState = readTrackerState(signal.payload);
  if (
    signal.type !== "tracker.state_observed" ||
    observedState === null ||
    !["Todo", "Rework", "Bootstrapping"].includes(observedState)
  ) {
    return [];
  }

  const commands = [];
  if (observedState !== "Bootstrapping") {
    commands.push(createTrackerTransitionCommand(signal, "Bootstrapping"));
  }

  commands.push(
    createDispatchCommand(
      signal,
      observedState === "Rework" ? "rework" : "implementation"
    )
  );

  return commands;
}

function buildBootstrappingRedispatchCommands(
  context: {
    projection: {
      data: SymphonyCurrentFlowData;
    };
    signal: WorkflowSignal;
  }
) {
  const runMode = resolveBootstrappingDispatchMode({
    signal: context.signal,
    data: context.projection.data
  });

  return runMode === null
    ? []
    : [createDispatchCommand(context.signal, runMode)];
}

function shouldTransitionToInProgress(
  signal: WorkflowSignal,
  runMode: SymphonyCurrentFlowRunMode
) {
  return isRunStarted(signal, runMode);
}

function shouldDispatchApprovedMergeOnEnter(context: {
  fromNode: string | null;
  signal: WorkflowSignal;
}) {
  return (
    isObservedTrackerState(context.signal, "Approved") &&
    context.fromNode !== "implementation"
  );
}

function isObservedTrackerState(
  signal: WorkflowSignal,
  state: SymphonyCurrentFlowTrackerState
) {
  return (
    signal.type === "tracker.state_observed" &&
    readTrackerState(signal.payload) === state
  );
}

function isRunStarted(
  signal: WorkflowSignal,
  runMode: SymphonyCurrentFlowRunMode
) {
  return (
    signal.type === "runtime.run_started" &&
    readRunMode(signal.payload) === runMode
  );
}

function hasCompletionKind(
  signal: WorkflowSignal,
  kind: Exclude<SymphonyCurrentFlowCompletionKind, "startup_failure">
) {
  return (
    signal.type === "runtime.completed" &&
    readCompletionKind(signal.payload) === kind
  );
}

function isPausedOutcome(signal: WorkflowSignal) {
  const kind = signal.type === "runtime.completed"
    ? readCompletionKind(signal.payload)
    : null;

  return (
    kind === "failure" ||
    kind === "rate_limited" ||
    kind === "provider_transient" ||
    kind === "stalled" ||
    kind === "max_turns_reached"
  );
}

function isBlockedMergeOutcome(signal: WorkflowSignal) {
  const kind = signal.type === "runtime.completed"
    ? readCompletionKind(signal.payload)
    : null;

  return (
    kind === "blocked" ||
    kind === "merge_blocked" ||
    kind === "failure" ||
    kind === "stalled" ||
    kind === "max_turns_reached"
  );
}

function maybeCreateTrackerTransitionCommand(
  signal: WorkflowSignal,
  targetState: SymphonyCurrentFlowTrackerState
) {
  return isObservedTrackerState(signal, targetState)
    ? []
    : [createTrackerTransitionCommand(signal, targetState)];
}

function createDispatchCommand(
  signal: WorkflowSignal,
  runMode: SymphonyCurrentFlowRunMode
) {
  return {
    id: createCommandId(signal, `dispatch_${runMode}`),
    kind: "run.dispatch",
    payload: {
      runMode
    }
  };
}

function createTrackerTransitionCommand(
  signal: WorkflowSignal,
  targetState: SymphonyCurrentFlowTrackerState
) {
  return {
    id: createCommandId(signal, `tracker_${normalizeToken(targetState)}`),
    kind: "tracker.transition",
    payload: {
      state: targetState
    }
  };
}

function buildTerminalReentryEdges(
  from: Extract<
    SymphonyCurrentFlowNode,
    "done" | "paused" | "blocked" | "failed"
  >
): WorkflowEdge<
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
>[] {
  return [
    new WorkflowEdge({
      id: `${from}_todo_to_bootstrapping`,
      from,
      to: "bootstrapping",
      reasonCode: `${from}_reopened_from_todo`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Todo")
    }),
    new WorkflowEdge({
      id: `${from}_rework_to_bootstrapping`,
      from,
      to: "bootstrapping",
      reasonCode: `${from}_reopened_from_rework`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Rework")
    }),
    new WorkflowEdge({
      id: `${from}_bootstrapping_to_bootstrapping`,
      from,
      to: "bootstrapping",
      reasonCode: `${from}_reopened_from_bootstrapping`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping")
    }),
    new WorkflowEdge({
      id: `${from}_review_to_review`,
      from,
      to: "review",
      reasonCode: `${from}_reopened_from_review`,
      guard: ({ signal }) => isObservedTrackerState(signal, "In Review")
    }),
    new WorkflowEdge({
      id: `${from}_approved_to_approved_merge`,
      from,
      to: "approved_merge",
      reasonCode: `${from}_reopened_from_approved`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Approved")
    })
  ];
}

function buildObservedStateTerminalEdges(
  from: Extract<
    SymphonyCurrentFlowNode,
    "implementation" | "rework" | "approved_merge"
  >
): WorkflowEdge<
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
>[] {
  return [
    new WorkflowEdge({
      id: `${from}_observed_paused`,
      from,
      to: "paused",
      reasonCode: `${from}_paused_observed`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Paused")
    }),
    new WorkflowEdge({
      id: `${from}_observed_blocked`,
      from,
      to: "blocked",
      reasonCode: `${from}_blocked_observed`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Blocked")
    }),
    new WorkflowEdge({
      id: `${from}_observed_failed`,
      from,
      to: "failed",
      reasonCode: `${from}_failed_observed`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Failed")
    })
  ];
}

function createCommandId(signal: WorkflowSignal, suffix: string) {
  const signalId = signal.id?.trim();
  if (!signalId) {
    throw new TypeError("Workflow signal id is required when building commands.");
  }

  return `command_${signalId}_${suffix}`;
}

function normalizeToken(value: string) {
  return value.toLowerCase().replaceAll(/\s+/g, "_");
}

function readTrackerState(payload: WorkflowPayload) {
  if (payload === null) {
    return null;
  }

  const value = payload["state"];
  return typeof value === "string"
    ? (value as SymphonyCurrentFlowTrackerState)
    : null;
}

function readRunMode(payload: WorkflowPayload) {
  if (payload === null) {
    return null;
  }

  const value = payload["runMode"];
  return typeof value === "string"
    ? (value as SymphonyCurrentFlowRunMode)
    : null;
}

function resolveBootstrappingDispatchMode(input: {
  signal: WorkflowSignal;
  data: SymphonyCurrentFlowData;
}) {
  if (!isObservedTrackerState(input.signal, "Bootstrapping")) {
    return null;
  }

  if (input.data.lastDispatchMode === "implementation" || input.data.lastDispatchMode === "rework") {
    return input.data.lastDispatchMode;
  }

  return input.data.lastObservedTrackerState === "Rework"
    ? "rework"
    : "implementation";
}

function readCompletionKind(payload: WorkflowPayload) {
  if (payload === null) {
    return null;
  }

  const value = payload["kind"];
  return typeof value === "string"
    ? (value as Exclude<SymphonyCurrentFlowCompletionKind, "startup_failure">)
    : null;
}
