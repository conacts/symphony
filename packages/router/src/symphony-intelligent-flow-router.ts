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
  createSymphonyCurrentFlowTrackerTransitionCommand,
  readSymphonyCurrentFlowDeliveryReportedSignal,
  readSymphonyCurrentFlowMergeResultReportedSignal,
  readSymphonyCurrentFlowReviewReworkRequestedSignal,
  readSymphonyCurrentFlowRunStartedSignal,
  readSymphonyCurrentFlowRuntimeCompletedSignal,
  readSymphonyCurrentFlowRuntimeStartupFailureSignal,
  readSymphonyCurrentFlowShutdownRequestedSignal,
  readSymphonyCurrentFlowStateRequestedSignal,
  readSymphonyCurrentFlowTrackerStateObservedSignal,
  readSymphonyCurrentFlowDispatchCommand,
  readSymphonyCurrentFlowTrackerTransitionCommand,
  type SymphonyCurrentFlowCompletionKind,
  type SymphonyCurrentFlowMergeResultRecord,
  type SymphonyCurrentFlowReviewReworkHandoff,
  type SymphonyCurrentFlowRunMode,
  type SymphonyCurrentFlowTrackerState
} from "./symphony-current-flow-contract.js";
import type { WorkflowRouterOptions } from "./workflow-router.js";
import type {
  WorkflowCommand,
  WorkflowJournalEvent,
  WorkflowSignal
} from "./types/index.js";
import type { WorkflowRouterPreset } from "./router-preset-registry.js";
import type {
  SymphonyIntelligentFlowLifecycleState
} from "./symphony-intelligent-flow-contract.js";

export type SymphonyIntelligentFlowNode =
  SymphonyIntelligentFlowLifecycleState;

export type SymphonyIntelligentFlowPolicy = Record<string, never>;

export type SymphonyIntelligentFlowData = {
  trackerState: SymphonyCurrentFlowTrackerState | null;
  confirmedTrackerState: SymphonyCurrentFlowTrackerState | null;
  lastObservedTrackerState: SymphonyCurrentFlowTrackerState | null;
  lastDispatchMode: SymphonyCurrentFlowRunMode | null;
  lastDispatchStatus: "pending" | "succeeded" | "failed" | null;
  lastRunMode: SymphonyCurrentFlowRunMode | null;
  lastRuntimeOutcome: SymphonyCurrentFlowCompletionKind | null;
  latestMergeResult: SymphonyCurrentFlowMergeResultRecord | null;
  latestReworkHandoff: SymphonyCurrentFlowReviewReworkHandoff | null;
};

const symphonyIntelligentFlowPolicy = Object.freeze({}) as SymphonyIntelligentFlowPolicy;

export function createSymphonyIntelligentFlowRouterDefinition(): WorkflowRouterDefinition<
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowPolicy
> {
  return {
    name: "symphony-intelligent-flow",
    version: "1",
    initialNode: "queued",
    nodes: [
      new WorkflowNode("queued"),
      new WorkflowNode("claimed"),
      new WorkflowNode("active", {
        enter: ({ signal }) =>
          readSymphonyCurrentFlowRunStartedSignal(signal) !== null
            ? maybeCreateTrackerTransitionCommand(signal, "In Progress")
            : []
      }),
      new WorkflowNode("awaiting_input"),
      new WorkflowNode("blocked", {
        enter: ({ signal }) => maybeCreateTrackerTransitionCommand(signal, "Blocked")
      }),
      new WorkflowNode("paused", {
        enter: ({ signal }) => maybeCreateTrackerTransitionCommand(signal, "Paused")
      }),
      new WorkflowNode("failed", {
        enter: ({ signal }) => maybeCreateTrackerTransitionCommand(signal, "Failed")
      }),
      new WorkflowNode("done", {
        enter: ({ signal }) => {
          const targetState = resolveClosedTrackerState(signal);
          return targetState ? maybeCreateTrackerTransitionCommand(signal, targetState) : [];
        }
      })
    ],
    edges: [
      new WorkflowEdge({
        id: "queued_todo_to_claimed",
        from: "queued",
        to: "claimed",
        reasonCode: "queued_claimed_from_todo",
        guard: ({ signal }) => isObservedTrackerState(signal, "Todo"),
        commands: ({ signal }) => buildClaimCommands(signal, "implementation")
      }),
      new WorkflowEdge({
        id: "queued_rework_to_claimed",
        from: "queued",
        to: "claimed",
        reasonCode: "queued_claimed_from_rework",
        guard: ({ signal }) => isObservedTrackerState(signal, "Rework"),
        commands: ({ signal }) => buildClaimCommands(signal, "rework")
      }),
      new WorkflowEdge({
        id: "queued_bootstrapping_to_claimed",
        from: "queued",
        to: "claimed",
        reasonCode: "queued_claimed_from_bootstrapping",
        guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping"),
        commands: (context) =>
          buildBootstrappingRedispatchCommands(context.signal, context.projection.data)
      }),
      new WorkflowEdge({
        id: "queued_in_progress_to_active",
        from: "queued",
        to: "active",
        reasonCode: "active_observed_in_progress",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Progress")
      }),
      new WorkflowEdge({
        id: "queued_review_to_active",
        from: "queued",
        to: "active",
        reasonCode: "active_observed_review",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Review")
      }),
      new WorkflowEdge({
        id: "queued_approved_to_active",
        from: "queued",
        to: "active",
        reasonCode: "active_observed_approved",
        guard: ({ signal }) => isObservedTrackerState(signal, "Approved")
      }),
      ...buildObservedTerminalEdges("queued"),
      new WorkflowEdge({
        id: "claimed_bootstrapping_to_claimed",
        from: "claimed",
        to: "claimed",
        reasonCode: "claimed_redispatched",
        guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping"),
        commands: (context) =>
          buildBootstrappingRedispatchCommands(context.signal, context.projection.data)
      }),
      new WorkflowEdge({
        id: "claimed_run_started_to_active",
        from: "claimed",
        to: "active",
        reasonCode: "active_run_started",
        guard: ({ signal }) => readSymphonyCurrentFlowRunStartedSignal(signal) !== null
      }),
      new WorkflowEdge({
        id: "claimed_in_progress_to_active",
        from: "claimed",
        to: "active",
        reasonCode: "active_observed_in_progress",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Progress")
      }),
      new WorkflowEdge({
        id: "claimed_review_to_active",
        from: "claimed",
        to: "active",
        reasonCode: "active_observed_review",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Review")
      }),
      new WorkflowEdge({
        id: "claimed_approved_to_active",
        from: "claimed",
        to: "active",
        reasonCode: "active_observed_approved",
        guard: ({ signal }) => isObservedTrackerState(signal, "Approved")
      }),
      new WorkflowEdge({
        id: "claimed_startup_failure_to_failed",
        from: "claimed",
        to: "failed",
        reasonCode: "claimed_startup_failure",
        guard: ({ signal }) => readSymphonyCurrentFlowRuntimeStartupFailureSignal(signal) !== null
      }),
      ...buildRequestedTerminalEdges("claimed"),
      ...buildObservedTerminalEdges("claimed"),
      new WorkflowEdge({
        id: "active_review_rework_requested_to_claimed",
        from: "active",
        to: "claimed",
        reasonCode: "active_requested_rework",
        guard: ({ signal }) => isReviewReworkRequested(signal),
        commands: ({ signal }) => [
          createTrackerTransitionCommand(signal, "Rework"),
          createTrackerTransitionCommand(signal, "Bootstrapping"),
          createDispatchCommand(signal, "rework")
        ]
      }),
      new WorkflowEdge({
        id: "active_delivery_completed_to_active",
        from: "active",
        to: "active",
        reasonCode: "active_delivery_recorded",
        guard: ({ signal }) => isDeliveryReported(signal, "completed"),
        commands: ({ signal }) => maybeCreateTrackerTransitionCommand(signal, "In Review")
      }),
      new WorkflowEdge({
        id: "active_delivery_blocked_to_blocked",
        from: "active",
        to: "blocked",
        reasonCode: "active_delivery_blocked",
        guard: ({ signal }) => isDeliveryReported(signal, "blocked")
      }),
      new WorkflowEdge({
        id: "active_merge_result_done_to_done",
        from: "active",
        to: "done",
        reasonCode: "active_merge_result_done",
        guard: ({ signal }) => isMergeResultReported(signal, "merged")
      }),
      new WorkflowEdge({
        id: "active_runtime_merged_to_done",
        from: "active",
        to: "done",
        reasonCode: "active_runtime_merged",
        guard: ({ signal }) => hasCompletionKind(signal, "merged")
      }),
      new WorkflowEdge({
        id: "active_merge_result_blocked_to_blocked",
        from: "active",
        to: "blocked",
        reasonCode: "active_merge_result_blocked",
        guard: ({ signal }) => isMergeResultReported(signal, "blocked")
      }),
      new WorkflowEdge({
        id: "active_runtime_blocked_to_blocked",
        from: "active",
        to: "blocked",
        reasonCode: "active_runtime_blocked",
        guard: ({ signal }) => isBlockedOutcome(signal)
      }),
      new WorkflowEdge({
        id: "active_runtime_paused_to_paused",
        from: "active",
        to: "paused",
        reasonCode: "active_runtime_paused",
        guard: ({ signal }) => isPausedOutcome(signal)
      }),
      new WorkflowEdge({
        id: "active_shutdown_to_paused",
        from: "active",
        to: "paused",
        reasonCode: "active_shutdown_paused",
        guard: ({ signal }) => isShutdownRequested(signal)
      }),
      new WorkflowEdge({
        id: "active_observed_in_progress_to_active",
        from: "active",
        to: "active",
        reasonCode: "active_reconfirmed_in_progress",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Progress")
      }),
      new WorkflowEdge({
        id: "active_observed_review_to_active",
        from: "active",
        to: "active",
        reasonCode: "active_reconfirmed_review",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Review")
      }),
      new WorkflowEdge({
        id: "active_observed_approved_to_active",
        from: "active",
        to: "active",
        reasonCode: "active_reconfirmed_approved",
        guard: ({ signal }) => isObservedTrackerState(signal, "Approved")
      }),
      ...buildRequestedTerminalEdges("active"),
      ...buildObservedTerminalEdges("active"),
      new WorkflowEdge({
        id: "awaiting_input_todo_to_claimed",
        from: "awaiting_input",
        to: "claimed",
        reasonCode: "awaiting_input_requeued_from_todo",
        guard: ({ signal }) => isObservedTrackerState(signal, "Todo"),
        commands: ({ signal }) => buildClaimCommands(signal, "implementation")
      }),
      new WorkflowEdge({
        id: "awaiting_input_rework_to_claimed",
        from: "awaiting_input",
        to: "claimed",
        reasonCode: "awaiting_input_requeued_from_rework",
        guard: ({ signal }) => isObservedTrackerState(signal, "Rework"),
        commands: ({ signal }) => buildClaimCommands(signal, "rework")
      }),
      new WorkflowEdge({
        id: "awaiting_input_bootstrapping_to_claimed",
        from: "awaiting_input",
        to: "claimed",
        reasonCode: "awaiting_input_claimed_from_bootstrapping",
        guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping"),
        commands: (context) =>
          buildBootstrappingRedispatchCommands(context.signal, context.projection.data)
      }),
      new WorkflowEdge({
        id: "awaiting_input_in_progress_to_active",
        from: "awaiting_input",
        to: "active",
        reasonCode: "awaiting_input_resumed_in_progress",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Progress")
      }),
      new WorkflowEdge({
        id: "awaiting_input_review_to_active",
        from: "awaiting_input",
        to: "active",
        reasonCode: "awaiting_input_resumed_review",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Review")
      }),
      new WorkflowEdge({
        id: "awaiting_input_approved_to_active",
        from: "awaiting_input",
        to: "active",
        reasonCode: "awaiting_input_resumed_approved",
        guard: ({ signal }) => isObservedTrackerState(signal, "Approved")
      }),
      ...buildRequestedTerminalEdges("awaiting_input"),
      ...buildObservedTerminalEdges("awaiting_input"),
      ...buildTerminalReentryEdges("done"),
      ...buildTerminalReentryEdges("paused"),
      ...buildTerminalReentryEdges("blocked"),
      ...buildTerminalReentryEdges("failed")
    ],
    strategy: createDeterministicStrategy(),
    createInitialData: () => ({
      trackerState: null,
      confirmedTrackerState: null,
      lastObservedTrackerState: null,
      lastDispatchMode: null,
      lastDispatchStatus: null,
      lastRunMode: null,
      lastRuntimeOutcome: null,
      latestMergeResult: null,
      latestReworkHandoff: null
    }),
    reduceData: ({ data, event, projection }) => {
      switch (event.kind) {
        case "signal_recorded":
          return reduceSignalData(data, event.signal);
        case "command_emitted":
          return reduceCommandData(data, event.command);
        case "command_settled":
          return reduceCommandSettlementData({
            data,
            event,
            projection
          });
        default:
          return data;
      }
    }
  };
}

export function createSymphonyIntelligentFlowRouter(
  options: WorkflowRouterOptions = {}
) {
  return createWorkflowRouter(
    createSymphonyIntelligentFlowRouterDefinition(),
    options
  );
}

export async function createSymphonyIntelligentFlowRouterAsync(
  options: WorkflowRouterOptions = {}
) {
  return await createWorkflowRouterAsync(
    createSymphonyIntelligentFlowRouterDefinition(),
    options
  );
}

export function createSymphonyIntelligentFlowRouterPreset(): WorkflowRouterPreset<
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowPolicy
> {
  return {
    async createRouter(input = {}) {
      return await createSymphonyIntelligentFlowRouterAsync(input);
    },
    createPolicy() {
      return symphonyIntelligentFlowPolicy;
    }
  };
}

function isObservedTrackerState(
  signal: WorkflowSignal,
  state: SymphonyCurrentFlowTrackerState
) {
  return (
    readSymphonyCurrentFlowTrackerStateObservedSignal(signal)?.payload.state === state
  );
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
    readSymphonyCurrentFlowMergeResultReportedSignal(signal)?.payload.mergeResult.status ===
    status
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
    readSymphonyCurrentFlowStateRequestedSignal(signal)?.payload.targetState === targetState
  );
}

function hasCompletionKind(
  signal: WorkflowSignal,
  kind: Exclude<SymphonyCurrentFlowCompletionKind, "startup_failure">
) {
  return readSymphonyCurrentFlowRuntimeCompletedSignal(signal)?.payload.kind === kind;
}

function isPausedOutcome(signal: WorkflowSignal) {
  const kind = readSymphonyCurrentFlowRuntimeCompletedSignal(signal)?.payload.kind ?? null;
  return (
    kind === "failure" ||
    kind === "rate_limited" ||
    kind === "provider_transient" ||
    kind === "stalled" ||
    kind === "max_turns_reached"
  );
}

function isBlockedOutcome(signal: WorkflowSignal) {
  const kind = readSymphonyCurrentFlowRuntimeCompletedSignal(signal)?.payload.kind ?? null;
  return kind === "blocked" || kind === "merge_blocked";
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

function buildClaimCommands(
  signal: WorkflowSignal,
  runMode: Extract<SymphonyCurrentFlowRunMode, "implementation" | "rework">
) {
  return [
    ...maybeCreateTrackerTransitionCommand(signal, "Bootstrapping"),
    createDispatchCommand(signal, runMode)
  ];
}

function buildBootstrappingRedispatchCommands(
  signal: WorkflowSignal,
  data: SymphonyIntelligentFlowData
) {
  const runMode =
    data.lastDispatchMode === "implementation" || data.lastDispatchMode === "rework"
      ? data.lastDispatchMode
      : data.lastObservedTrackerState === "Rework"
        ? "rework"
        : "implementation";

  return [createDispatchCommand(signal, runMode)];
}

function resolveClosedTrackerState(
  signal: WorkflowSignal
): Extract<SymphonyCurrentFlowTrackerState, "Done" | "Canceled"> | null {
  if (isObservedTrackerState(signal, "Done") || hasCompletionKind(signal, "merged")) {
    return "Done";
  }

  if (isObservedTrackerState(signal, "Canceled") || isStateRequested(signal, "Canceled")) {
    return "Canceled";
  }

  if (isMergeResultReported(signal, "merged")) {
    return "Done";
  }

  return null;
}

function buildTerminalReentryEdges(
  from: Extract<SymphonyIntelligentFlowNode, "done" | "paused" | "blocked" | "failed">
): WorkflowEdge<
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowPolicy
>[] {
  return [
    new WorkflowEdge({
      id: `${from}_todo_to_claimed`,
      from,
      to: "claimed",
      reasonCode: `${from}_reopened_from_todo`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Todo"),
      commands: ({ signal }) => buildClaimCommands(signal, "implementation")
    }),
    new WorkflowEdge({
      id: `${from}_rework_to_claimed`,
      from,
      to: "claimed",
      reasonCode: `${from}_reopened_from_rework`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Rework"),
      commands: ({ signal }) => buildClaimCommands(signal, "rework")
    }),
    new WorkflowEdge({
      id: `${from}_bootstrapping_to_claimed`,
      from,
      to: "claimed",
      reasonCode: `${from}_reopened_from_bootstrapping`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping"),
      commands: (context) =>
        buildBootstrappingRedispatchCommands(context.signal, context.projection.data)
    }),
    new WorkflowEdge({
      id: `${from}_in_progress_to_active`,
      from,
      to: "active",
      reasonCode: `${from}_reopened_from_in_progress`,
      guard: ({ signal }) => isObservedTrackerState(signal, "In Progress")
    }),
    new WorkflowEdge({
      id: `${from}_review_to_active`,
      from,
      to: "active",
      reasonCode: `${from}_reopened_from_review`,
      guard: ({ signal }) => isObservedTrackerState(signal, "In Review")
    }),
    new WorkflowEdge({
      id: `${from}_approved_to_active`,
      from,
      to: "active",
      reasonCode: `${from}_reopened_from_approved`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Approved")
    })
  ];
}

function buildRequestedTerminalEdges(
  from: Extract<SymphonyIntelligentFlowNode, "claimed" | "active" | "awaiting_input">
): WorkflowEdge<
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowPolicy
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
      to: "done",
      reasonCode: `${from}_state_requested_canceled`,
      guard: ({ signal }) => isStateRequested(signal, "Canceled")
    })
  ];
}

function buildObservedTerminalEdges(
  from: Extract<SymphonyIntelligentFlowNode, "queued" | "claimed" | "active" | "awaiting_input">
): WorkflowEdge<
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowPolicy
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
      id: `${from}_observed_done`,
      from,
      to: "done",
      reasonCode: `${from}_done_observed`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Done")
    }),
    new WorkflowEdge({
      id: `${from}_observed_canceled`,
      from,
      to: "done",
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

function reduceSignalData(
  data: SymphonyIntelligentFlowData,
  signal: WorkflowSignal
): SymphonyIntelligentFlowData {
  const observedTrackerState =
    readSymphonyCurrentFlowTrackerStateObservedSignal(signal)?.payload.state ?? null;
  if (observedTrackerState !== null) {
    return {
      ...data,
      trackerState: observedTrackerState,
      confirmedTrackerState: observedTrackerState,
      lastObservedTrackerState: observedTrackerState
    };
  }

  const startedRunMode = readSymphonyCurrentFlowRunStartedSignal(signal)?.payload.runMode ?? null;
  if (startedRunMode !== null) {
    return {
      ...data,
      lastRunMode: startedRunMode
    };
  }

  const reworkRequested = readSymphonyCurrentFlowReviewReworkRequestedSignal(signal);
  if (reworkRequested !== null) {
    return {
      ...data,
      latestReworkHandoff: reworkRequested.payload.handoff
    };
  }

  const mergeResultReported = readSymphonyCurrentFlowMergeResultReportedSignal(signal);
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
  data: SymphonyIntelligentFlowData,
  command: WorkflowCommand
): SymphonyIntelligentFlowData {
  const trackerTransition = readSymphonyCurrentFlowTrackerTransitionCommand(command);
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
      lastDispatchMode: dispatchCommand.payload.runMode,
      lastDispatchStatus: "pending"
    };
  }

  return data;
}

function reduceCommandSettlementData(input: {
  data: SymphonyIntelligentFlowData;
  event: Extract<
    WorkflowJournalEvent<SymphonyIntelligentFlowNode>,
    { kind: "command_settled" }
  >;
  projection: {
    pendingCommands: WorkflowCommand[];
  };
}) {
  const pendingCommand = input.projection.pendingCommands.find(
    (command) => command.id === input.event.commandId
  );
  if (!pendingCommand) {
    return input.data;
  }

  const trackerTransition = readSymphonyCurrentFlowTrackerTransitionCommand(pendingCommand);
  if (trackerTransition) {
    if (input.event.status === "succeeded") {
      return {
        ...input.data,
        trackerState: trackerTransition.payload.state,
        confirmedTrackerState: trackerTransition.payload.state
      };
    }

    return {
      ...input.data,
      trackerState: input.data.confirmedTrackerState
    };
  }

  const dispatchCommand = readSymphonyCurrentFlowDispatchCommand(pendingCommand);
  if (dispatchCommand) {
    return {
      ...input.data,
      lastDispatchStatus: input.event.status
    };
  }

  return input.data;
}
