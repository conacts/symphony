import {
  createWorkflowRouter,
  createWorkflowRouterAsync
} from "./router-builder.js";
import { createDeterministicStrategy } from "./router-deterministic-strategy.js";
import type { WorkflowRouterDefinition } from "./router-definition.js";
import { WorkflowEdge } from "./router-edge.js";
import { WorkflowNode } from "./router-node.js";
import {
  createSymphonyCurrentFlowDispatchCommand,
  readSymphonyCurrentFlowDeliveryReportedSignal,
  readSymphonyCurrentFlowMergeResultReportedSignal,
  readSymphonyCurrentFlowReviewReworkRequestedSignal,
  readSymphonyCurrentFlowStateRequestedSignal,
  createSymphonyCurrentFlowTrackerTransitionCommand,
  readSymphonyCurrentFlowDispatchCommand,
  readSymphonyCurrentFlowRuntimeCompletedSignal,
  readSymphonyCurrentFlowRuntimeStartupFailureSignal,
  readSymphonyCurrentFlowRunStartedSignal,
  readSymphonyCurrentFlowShutdownRequestedSignal,
  readSymphonyCurrentFlowTrackerStateObservedSignal,
  readSymphonyCurrentFlowTrackerTransitionCommand,
  type SymphonyCurrentFlowCompletionKind,
  type SymphonyCurrentFlowMergeResultRecord,
  type SymphonyCurrentFlowReviewReworkHandoff,
  type SymphonyCurrentFlowRunMode,
  type SymphonyCurrentFlowTrackerState
} from "./symphony-current-flow-contract.js";
import type { WorkflowRouterOptions } from "./workflow-router.js";
import type { WorkflowCommand, WorkflowSignal } from "./types/index.js";
import type { WorkflowRouterPreset } from "./router-preset-registry.js";

export type SymphonyCurrentFlowNode =
  | "idle"
  | "bootstrapping"
  | "implementation"
  | "rework"
  | "review"
  | "approved_merge"
  | "done"
  | "canceled"
  | "paused"
  | "blocked"
  | "failed";

export type SymphonyCurrentFlowPolicy = Record<string, never>;

export type SymphonyCurrentFlowData = {
  trackerState: SymphonyCurrentFlowTrackerState | null;
  lastObservedTrackerState: SymphonyCurrentFlowTrackerState | null;
  lastDispatchMode: SymphonyCurrentFlowRunMode | null;
  lastRunMode: SymphonyCurrentFlowRunMode | null;
  lastRuntimeOutcome: SymphonyCurrentFlowCompletionKind | null;
  latestMergeResult: SymphonyCurrentFlowMergeResultRecord | null;
  latestReworkHandoff: SymphonyCurrentFlowReviewReworkHandoff | null;
};

const symphonyCurrentFlowPolicy = Object.freeze({}) as SymphonyCurrentFlowPolicy;

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
      new WorkflowNode("canceled", {
        terminal: true,
        enter: ({ signal }) =>
          maybeCreateTrackerTransitionCommand(signal, "Canceled")
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
        id: "review_rework_requested_to_bootstrapping",
        from: "review",
        to: "bootstrapping",
        reasonCode: "review_requested_rework",
        guard: ({ signal }) => isReviewReworkRequested(signal),
        commands: ({ signal }) => [
          createTrackerTransitionCommand(signal, "Rework"),
          createTrackerTransitionCommand(signal, "Bootstrapping"),
          createDispatchCommand(signal, "rework")
        ]
      }),
      new WorkflowEdge({
        id: "review_rework_to_bootstrapping",
        from: "review",
        to: "bootstrapping",
        reasonCode: "review_requested_rework",
        guard: ({ signal }) => isObservedTrackerState(signal, "Rework")
      }),
      ...buildTerminalReentryEdges("done"),
      ...buildTerminalReentryEdges("canceled"),
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
        id: "implementation_delivery_reported_to_review",
        from: "implementation",
        to: "review",
        reasonCode: "delivery_reported",
        guard: ({ signal }) => isDeliveryReported(signal, "completed"),
        commands: ({ signal }) => [createTrackerTransitionCommand(signal, "In Review")]
      }),
      new WorkflowEdge({
        id: "rework_delivery_reported_to_review",
        from: "rework",
        to: "review",
        reasonCode: "rework_delivery_reported",
        guard: ({ signal }) => isDeliveryReported(signal, "completed"),
        commands: ({ signal }) => [createTrackerTransitionCommand(signal, "In Review")]
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
      new WorkflowEdge({
        id: "implementation_delivery_reported_to_blocked",
        from: "implementation",
        to: "blocked",
        reasonCode: "implementation_delivery_blocked",
        guard: ({ signal }) => isDeliveryReported(signal, "blocked")
      }),
      new WorkflowEdge({
        id: "rework_delivery_reported_to_blocked",
        from: "rework",
        to: "blocked",
        reasonCode: "rework_delivery_blocked",
        guard: ({ signal }) => isDeliveryReported(signal, "blocked")
      }),
      ...buildRequestedTerminalEdges("implementation"),
      ...buildRequestedTerminalEdges("rework"),
      ...buildRequestedTerminalEdges("approved_merge"),
      ...buildObservedStateTerminalEdges("bootstrapping"),
      ...buildObservedStateTerminalEdges("review"),
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
        id: "approved_merge_merge_result_reported_done",
        from: "approved_merge",
        to: "done",
        reasonCode: "merge_result_reported",
        guard: ({ signal }) => isMergeResultReported(signal, "merged")
      }),
      new WorkflowEdge({
        id: "approved_merge_merge_result_reported_blocked",
        from: "approved_merge",
        to: "blocked",
        reasonCode: "merge_result_blocked_reported",
        guard: ({ signal }) => isMergeResultReported(signal, "blocked")
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
        id: "implementation_shutdown_paused",
        from: "implementation",
        to: "paused",
        reasonCode: "implementation_shutdown_paused",
        guard: ({ signal }) => isShutdownRequested(signal)
      }),
      new WorkflowEdge({
        id: "rework_paused",
        from: "rework",
        to: "paused",
        reasonCode: "rework_paused",
        guard: ({ signal }) => isPausedOutcome(signal)
      }),
      new WorkflowEdge({
        id: "rework_shutdown_paused",
        from: "rework",
        to: "paused",
        reasonCode: "rework_shutdown_paused",
        guard: ({ signal }) => isShutdownRequested(signal)
      }),
      new WorkflowEdge({
        id: "approved_merge_shutdown_paused",
        from: "approved_merge",
        to: "paused",
        reasonCode: "approved_merge_shutdown_paused",
        guard: ({ signal }) => isShutdownRequested(signal)
      })
    ],
    strategy: createDeterministicStrategy(),
    createInitialData: () => ({
      trackerState: null,
      lastObservedTrackerState: null,
      lastDispatchMode: null,
      lastRunMode: null,
      lastRuntimeOutcome: null,
      latestMergeResult: null,
      latestReworkHandoff: null
    }),
    reduceData: ({ data, event }) => {
      switch (event.kind) {
        case "signal_recorded":
          return reduceSignalData(data, event.signal);
        case "command_emitted":
          return reduceCommandData(data, event.command);
        default:
          return data;
      }
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

export function createSymphonyCurrentFlowRouterPreset(): WorkflowRouterPreset<
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
> {
  return {
    async createRouter(input = {}) {
      return await createSymphonyCurrentFlowRouterAsync(input);
    },
    createPolicy() {
      return symphonyCurrentFlowPolicy;
    }
  };
}

function buildBootstrappingEnterCommands(
  signal: WorkflowSignal
) {
  const observed = readSymphonyCurrentFlowTrackerStateObservedSignal(signal);
  const observedState = observed?.payload.state ?? null;
  if (
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
    readSymphonyCurrentFlowTrackerStateObservedSignal(signal)?.payload.state ===
    state
  );
}

function isRunStarted(
  signal: WorkflowSignal,
  runMode: SymphonyCurrentFlowRunMode
) {
  return readSymphonyCurrentFlowRunStartedSignal(signal)?.payload.runMode === runMode;
}

function isDeliveryReported(
  signal: WorkflowSignal,
  status: "completed" | "blocked"
) {
  return readSymphonyCurrentFlowDeliveryReportedSignal(signal)?.payload.status === status;
}

function isMergeResultReported(
  signal: WorkflowSignal,
  status: "merged" | "blocked"
) {
  return (
    readSymphonyCurrentFlowMergeResultReportedSignal(signal)?.payload.mergeResult
      .status === status
  );
}

function isReviewReworkRequested(signal: WorkflowSignal) {
  return readSymphonyCurrentFlowReviewReworkRequestedSignal(signal) !== null;
}

function isStateRequested(
  signal: WorkflowSignal,
  targetState: "Paused" | "Blocked" | "Failed" | "Canceled"
) {
  return (
    readSymphonyCurrentFlowStateRequestedSignal(signal)?.payload.targetState ===
    targetState
  );
}

function hasCompletionKind(
  signal: WorkflowSignal,
  kind: Exclude<SymphonyCurrentFlowCompletionKind, "startup_failure">
) {
  return readSymphonyCurrentFlowRuntimeCompletedSignal(signal)?.payload.kind === kind;
}

function isPausedOutcome(signal: WorkflowSignal) {
  const kind =
    readSymphonyCurrentFlowRuntimeCompletedSignal(signal)?.payload.kind ?? null;

  return (
    kind === "failure" ||
    kind === "rate_limited" ||
    kind === "provider_transient" ||
    kind === "stalled" ||
    kind === "max_turns_reached"
  );
}

function isBlockedMergeOutcome(signal: WorkflowSignal) {
  const kind =
    readSymphonyCurrentFlowRuntimeCompletedSignal(signal)?.payload.kind ?? null;

  return (
    kind === "blocked" ||
    kind === "merge_blocked" ||
    kind === "failure" ||
    kind === "stalled" ||
    kind === "max_turns_reached"
  );
}

function isShutdownRequested(signal: WorkflowSignal) {
  return readSymphonyCurrentFlowShutdownRequestedSignal(signal) !== null;
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
  return createSymphonyCurrentFlowDispatchCommand({
    id: createCommandId(signal, `dispatch_${runMode}`),
    dedupeKey: null,
    runMode
  });
}

function createTrackerTransitionCommand(
  signal: WorkflowSignal,
  targetState: SymphonyCurrentFlowTrackerState
) {
  return createSymphonyCurrentFlowTrackerTransitionCommand({
    id: createCommandId(signal, `tracker_${normalizeToken(targetState)}`),
    dedupeKey: null,
    state: targetState
  });
}

function buildTerminalReentryEdges(
  from: Extract<
    SymphonyCurrentFlowNode,
    "done" | "canceled" | "paused" | "blocked" | "failed"
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

function buildRequestedTerminalEdges(
  from: Extract<
    SymphonyCurrentFlowNode,
    "bootstrapping" | "review" | "implementation" | "rework" | "approved_merge"
  >
): WorkflowEdge<
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
>[] {
  return [
    new WorkflowEdge({
      id: `${from}_state_requested_paused`,
      from,
      to: "paused",
      reasonCode: `${from}_state_requested_paused`,
      guard: ({ signal }) => isStateRequested(signal, "Paused")
    }),
    new WorkflowEdge({
      id: `${from}_state_requested_blocked`,
      from,
      to: "blocked",
      reasonCode: `${from}_state_requested_blocked`,
      guard: ({ signal }) => isStateRequested(signal, "Blocked")
    }),
    new WorkflowEdge({
      id: `${from}_state_requested_failed`,
      from,
      to: "failed",
      reasonCode: `${from}_state_requested_failed`,
      guard: ({ signal }) => isStateRequested(signal, "Failed")
    }),
    new WorkflowEdge({
      id: `${from}_state_requested_canceled`,
      from,
      to: "canceled",
      reasonCode: `${from}_state_requested_canceled`,
      guard: ({ signal }) => isStateRequested(signal, "Canceled")
    })
  ];
}

function buildObservedStateTerminalEdges(
  from: Extract<
    SymphonyCurrentFlowNode,
    "bootstrapping" | "review" | "implementation" | "rework" | "approved_merge"
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
    }),
    new WorkflowEdge({
      id: `${from}_observed_canceled`,
      from,
      to: "canceled",
      reasonCode: `${from}_canceled_observed`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Canceled")
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

function reduceSignalData(
  data: SymphonyCurrentFlowData,
  signal: WorkflowSignal
): SymphonyCurrentFlowData {
  const observedTrackerState =
    readSymphonyCurrentFlowTrackerStateObservedSignal(signal)?.payload.state ??
    null;
  if (observedTrackerState !== null) {
    return {
      ...data,
      trackerState: observedTrackerState,
      lastObservedTrackerState: observedTrackerState
    };
  }

  const startedRunMode =
    readSymphonyCurrentFlowRunStartedSignal(signal)?.payload.runMode ?? null;
  if (startedRunMode !== null) {
    return {
      ...data,
      lastRunMode: startedRunMode
    };
  }

  const reworkRequested =
    readSymphonyCurrentFlowReviewReworkRequestedSignal(signal);
  if (reworkRequested !== null) {
    return {
      ...data,
      latestReworkHandoff: reworkRequested.payload.handoff
    };
  }

  const mergeResultReported =
    readSymphonyCurrentFlowMergeResultReportedSignal(signal);
  if (mergeResultReported !== null) {
    return {
      ...data,
      latestMergeResult: mergeResultReported.payload.mergeResult
    };
  }

  const completionKind =
    readSymphonyCurrentFlowRuntimeCompletedSignal(signal)?.payload.kind ?? null;
  if (completionKind !== null) {
    return {
      ...data,
      lastRuntimeOutcome: completionKind
    };
  }

  if (readSymphonyCurrentFlowRuntimeStartupFailureSignal(signal) !== null) {
    return {
      ...data,
      lastRuntimeOutcome: "startup_failure"
    };
  }

  return data;
}

function reduceCommandData(
  data: SymphonyCurrentFlowData,
  command: WorkflowCommand
): SymphonyCurrentFlowData {
  const trackerTransition =
    readSymphonyCurrentFlowTrackerTransitionCommand(command);
  if (trackerTransition) {
    return {
      ...data,
      trackerState: trackerTransition.payload.state
    };
  }

  const dispatchCommand = readSymphonyCurrentFlowDispatchCommand(command);
  if (dispatchCommand) {
    return {
      ...data,
      lastDispatchMode: dispatchCommand.payload.runMode
    };
  }

  return data;
}
