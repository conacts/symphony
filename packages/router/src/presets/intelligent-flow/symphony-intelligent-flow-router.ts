import {
  createWorkflowRouter,
  createWorkflowRouterAsync
} from "../../engine/router-builder.js";
import { createDeterministicStrategy } from "../../engine/router-deterministic-strategy.js";
import type { WorkflowRouterDefinition } from "../../engine/router-definition.js";
import { WorkflowEdge } from "../../engine/router-edge.js";
import { WorkflowNode } from "../../engine/router-node.js";
import {
  readSymphonyCapabilityBlockedSignal,
  readSymphonyWorkflowClarificationAnsweredSignal,
  readSymphonyWorkflowClarificationRequestedSignal
} from "../../capability/symphony-capability-contract.js";
import {
  createSymphonyIntelligentFlowDispatchCommand,
  createSymphonyIntelligentFlowTrackerTransitionCommand,
  readSymphonyIntelligentFlowRunStartedSignal,
  readSymphonyIntelligentFlowRuntimeCompletedSignal,
  readSymphonyIntelligentFlowRuntimeStartupFailureSignal,
  readSymphonyIntelligentFlowShutdownRequestedSignal,
  readSymphonyIntelligentFlowStateRequestedSignal,
  readSymphonyIntelligentFlowTrackerStateObservedSignal,
  readSymphonyIntelligentFlowDispatchCommand,
  readSymphonyIntelligentFlowTrackerTransitionCommand,
  type SymphonyIntelligentFlowCompletionKind,
  type SymphonyIntelligentFlowRunMode,
  type SymphonyIntelligentFlowTrackerState
} from "./symphony-intelligent-flow-lifecycle-contract.js";
import type { WorkflowRouterOptions } from "../../engine/workflow-router.js";
import type {
  WorkflowCommand,
  WorkflowJournalEvent,
  WorkflowSignal
} from "../../types/index.js";
import type { WorkflowRouterPreset } from "../../engine/router-preset-registry.js";
import type {
  SymphonyIntelligentFlowLifecycleState
} from "./symphony-intelligent-flow-contract.js";

export type SymphonyIntelligentFlowNode =
  SymphonyIntelligentFlowLifecycleState;

export type SymphonyIntelligentFlowPolicy = Record<string, never>;

export type SymphonyIntelligentFlowData = {
  trackerState: SymphonyIntelligentFlowTrackerState | null;
  confirmedTrackerState: SymphonyIntelligentFlowTrackerState | null;
  lastObservedTrackerState: SymphonyIntelligentFlowTrackerState | null;
  lastDispatchMode: SymphonyIntelligentFlowRunMode | null;
  lastDispatchStatus: "pending" | "succeeded" | "failed" | null;
  lastRunMode: SymphonyIntelligentFlowRunMode | null;
  lastRuntimeOutcome: SymphonyIntelligentFlowCompletionKind | null;
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
          readSymphonyIntelligentFlowRunStartedSignal(signal) !== null
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
        commands: ({ signal }) => buildClaimCommands(signal)
      }),
      new WorkflowEdge({
        id: "queued_bootstrapping_to_claimed",
        from: "queued",
        to: "claimed",
        reasonCode: "queued_claimed_from_bootstrapping",
        guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping"),
        commands: (context) => buildBootstrappingRedispatchCommands(context.signal)
      }),
      new WorkflowEdge({
        id: "queued_in_progress_to_active",
        from: "queued",
        to: "active",
        reasonCode: "active_observed_in_progress",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Progress")
      }),
      ...buildObservedTerminalEdges("queued"),
      new WorkflowEdge({
        id: "claimed_bootstrapping_to_claimed",
        from: "claimed",
        to: "claimed",
        reasonCode: "claimed_redispatched",
        guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping"),
        commands: (context) => buildBootstrappingRedispatchCommands(context.signal)
      }),
      new WorkflowEdge({
        id: "claimed_run_started_to_active",
        from: "claimed",
        to: "active",
        reasonCode: "active_run_started",
        guard: ({ signal }) => readSymphonyIntelligentFlowRunStartedSignal(signal) !== null
      }),
      new WorkflowEdge({
        id: "claimed_clarification_requested_to_awaiting_input",
        from: "claimed",
        to: "awaiting_input",
        reasonCode: "claimed_waiting_for_clarification",
        guard: ({ signal }) => isClarificationRequested(signal)
      }),
      new WorkflowEdge({
        id: "claimed_capability_blocked_to_blocked",
        from: "claimed",
        to: "blocked",
        reasonCode: "claimed_capability_blocked",
        guard: ({ signal }) => isCapabilityBlocked(signal)
      }),
      new WorkflowEdge({
        id: "claimed_in_progress_to_active",
        from: "claimed",
        to: "active",
        reasonCode: "active_observed_in_progress",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Progress")
      }),
      new WorkflowEdge({
        id: "claimed_startup_failure_to_failed",
        from: "claimed",
        to: "failed",
        reasonCode: "claimed_startup_failure",
        guard: ({ signal }) => readSymphonyIntelligentFlowRuntimeStartupFailureSignal(signal) !== null
      }),
      ...buildRequestedTerminalEdges("claimed"),
      ...buildObservedTerminalEdges("claimed"),
      new WorkflowEdge({
        id: "active_runtime_delivered_to_done",
        from: "active",
        to: "done",
        reasonCode: "active_runtime_delivered",
        guard: ({ signal }) => isDeliveredOutcome(signal)
      }),
      new WorkflowEdge({
        id: "active_clarification_requested_to_awaiting_input",
        from: "active",
        to: "awaiting_input",
        reasonCode: "active_waiting_for_clarification",
        guard: ({ signal }) => isClarificationRequested(signal)
      }),
      new WorkflowEdge({
        id: "active_runtime_blocked_to_blocked",
        from: "active",
        to: "blocked",
        reasonCode: "active_runtime_blocked",
        guard: ({ signal }) => isBlockedOutcome(signal)
      }),
      new WorkflowEdge({
        id: "active_capability_blocked_to_blocked",
        from: "active",
        to: "blocked",
        reasonCode: "active_capability_blocked",
        guard: ({ signal }) => isCapabilityBlocked(signal)
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
      ...buildRequestedTerminalEdges("active"),
      ...buildObservedTerminalEdges("active"),
      new WorkflowEdge({
        id: "awaiting_input_todo_to_claimed",
        from: "awaiting_input",
        to: "claimed",
        reasonCode: "awaiting_input_requeued_from_todo",
        guard: ({ signal }) => isObservedTrackerState(signal, "Todo"),
        commands: ({ signal }) => buildClaimCommands(signal)
      }),
      new WorkflowEdge({
        id: "awaiting_input_bootstrapping_to_claimed",
        from: "awaiting_input",
        to: "claimed",
        reasonCode: "awaiting_input_claimed_from_bootstrapping",
        guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping"),
        commands: (context) => buildBootstrappingRedispatchCommands(context.signal)
      }),
      new WorkflowEdge({
        id: "awaiting_input_clarification_answered_to_claimed",
        from: "awaiting_input",
        to: "claimed",
        reasonCode: "awaiting_input_clarification_answered",
        guard: ({ signal }) => isClarificationAnswered(signal)
      }),
      new WorkflowEdge({
        id: "awaiting_input_in_progress_to_active",
        from: "awaiting_input",
        to: "active",
        reasonCode: "awaiting_input_resumed_in_progress",
        guard: ({ signal }) => isObservedTrackerState(signal, "In Progress")
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
      lastRuntimeOutcome: null
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
  state: SymphonyIntelligentFlowTrackerState
) {
  return (
    readSymphonyIntelligentFlowTrackerStateObservedSignal(signal)?.payload.state === state
  );
}

function isClarificationRequested(signal: WorkflowSignal) {
  return readSymphonyWorkflowClarificationRequestedSignal(signal) !== null;
}

function isClarificationAnswered(signal: WorkflowSignal) {
  return readSymphonyWorkflowClarificationAnsweredSignal(signal) !== null;
}

function isStateRequested(
  signal: WorkflowSignal,
  targetState: "Paused" | "Blocked" | "Failed" | "Canceled"
) {
  return (
    readSymphonyIntelligentFlowStateRequestedSignal(signal)?.payload.targetState === targetState
  );
}

function isPausedOutcome(signal: WorkflowSignal) {
  const kind = readSymphonyIntelligentFlowRuntimeCompletedSignal(signal)?.payload.kind ?? null;
  return (
    kind === "failure" ||
    kind === "rate_limited" ||
    kind === "provider_transient" ||
    kind === "stalled" ||
    kind === "max_turns_reached"
  );
}

function isDeliveredOutcome(signal: WorkflowSignal) {
  const kind = readSymphonyIntelligentFlowRuntimeCompletedSignal(signal)?.payload.kind ?? null;
  return kind === "delivered";
}

function isBlockedOutcome(signal: WorkflowSignal) {
  const kind = readSymphonyIntelligentFlowRuntimeCompletedSignal(signal)?.payload.kind ?? null;
  return kind === "blocked";
}

function isCapabilityBlocked(signal: WorkflowSignal) {
  return readSymphonyCapabilityBlockedSignal(signal) !== null;
}

function isShutdownRequested(signal: WorkflowSignal) {
  return readSymphonyIntelligentFlowShutdownRequestedSignal(signal) !== null;
}

function maybeCreateTrackerTransitionCommand(
  signal: WorkflowSignal,
  targetState: SymphonyIntelligentFlowTrackerState
) {
  return isObservedTrackerState(signal, targetState)
    ? []
    : [createTrackerTransitionCommand(signal, targetState)];
}

function createDispatchCommand(
  signal: WorkflowSignal,
  runMode: SymphonyIntelligentFlowRunMode
) {
  return createSymphonyIntelligentFlowDispatchCommand({
    id: createCommandId(signal, `dispatch_${runMode}`),
    dedupeKey: null,
    runMode
  });
}

function createTrackerTransitionCommand(
  signal: WorkflowSignal,
  targetState: SymphonyIntelligentFlowTrackerState
) {
  return createSymphonyIntelligentFlowTrackerTransitionCommand({
    id: createCommandId(signal, `tracker_${normalizeToken(targetState)}`),
    dedupeKey: null,
    state: targetState
  });
}

function buildClaimCommands(
  signal: WorkflowSignal
) {
  return [
    ...maybeCreateTrackerTransitionCommand(signal, "Bootstrapping"),
    createDispatchCommand(signal, "implementation")
  ];
}

function buildBootstrappingRedispatchCommands(
  signal: WorkflowSignal
) {
  return [createDispatchCommand(signal, "implementation")];
}

function resolveClosedTrackerState(
  signal: WorkflowSignal
): Extract<SymphonyIntelligentFlowTrackerState, "Done" | "Canceled"> | null {
  if (isObservedTrackerState(signal, "Done") || isDeliveredOutcome(signal)) {
    return "Done";
  }

  if (isObservedTrackerState(signal, "Canceled") || isStateRequested(signal, "Canceled")) {
    return "Canceled";
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
      commands: ({ signal }) => buildClaimCommands(signal)
    }),
    new WorkflowEdge({
      id: `${from}_bootstrapping_to_claimed`,
      from,
      to: "claimed",
      reasonCode: `${from}_reopened_from_bootstrapping`,
      guard: ({ signal }) => isObservedTrackerState(signal, "Bootstrapping"),
      commands: (context) => buildBootstrappingRedispatchCommands(context.signal)
    }),
    new WorkflowEdge({
      id: `${from}_in_progress_to_active`,
      from,
      to: "active",
      reasonCode: `${from}_reopened_from_in_progress`,
      guard: ({ signal }) => isObservedTrackerState(signal, "In Progress")
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
    readSymphonyIntelligentFlowTrackerStateObservedSignal(signal)?.payload.state ?? null;
  if (observedTrackerState !== null) {
    return {
      ...data,
      trackerState: observedTrackerState,
      confirmedTrackerState: observedTrackerState,
      lastObservedTrackerState: observedTrackerState
    };
  }

  const startedRunMode = readSymphonyIntelligentFlowRunStartedSignal(signal)?.payload.runMode ?? null;
  if (startedRunMode !== null) {
    return {
      ...data,
      lastRunMode: startedRunMode
    };
  }

  const completionKind =
    readSymphonyIntelligentFlowRuntimeCompletedSignal(signal)?.payload.kind ?? null;
  if (completionKind !== null) {
    return {
      ...data,
      lastRuntimeOutcome: completionKind
    };
  }

  if (readSymphonyIntelligentFlowRuntimeStartupFailureSignal(signal) !== null) {
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
  const trackerTransition = readSymphonyIntelligentFlowTrackerTransitionCommand(command);
  if (trackerTransition) {
    return {
      ...data,
      trackerState: trackerTransition.payload.state
    };
  }

  const dispatchCommand = readSymphonyIntelligentFlowDispatchCommand(command);
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

  const trackerTransition = readSymphonyIntelligentFlowTrackerTransitionCommand(pendingCommand);
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

  const dispatchCommand = readSymphonyIntelligentFlowDispatchCommand(pendingCommand);
  if (dispatchCommand) {
    return {
      ...input.data,
      lastDispatchStatus: input.event.status
    };
  }

  return input.data;
}
