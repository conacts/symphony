import { z } from "zod";
import type { WorkflowCommand, WorkflowSignal } from "./types/index.js";
import { workflowSignalSchema } from "./types/schema.js";

const workflowNullableIdSchema = z.string().trim().min(1).nullable();

const workflowCommandSchema = z
  .object({
    id: z.string().trim().min(1),
    kind: z.string().trim().min(1),
    dedupeKey: workflowNullableIdSchema,
    payload: z.record(z.string(), z.unknown()).nullable()
  })
  .strict();

const trackerStates = [
  "Todo",
  "Bootstrapping",
  "In Progress",
  "In Review",
  "Rework",
  "Approved",
  "Done",
  "Canceled",
  "Paused",
  "Blocked",
  "Failed"
] as const;

const runModes = [
  "implementation",
  "rework",
  "approved_merge"
] as const;

const deliveryStatuses = [
  "completed",
  "blocked",
  "partial"
] as const;

const mergeResultStatuses = [
  "merged",
  "blocked"
] as const;

const stateRequestKinds = [
  "spike_result",
  "cancel"
] as const;

const stateRequestTargetStates = [
  "Paused",
  "Blocked",
  "Failed",
  "Canceled"
] as const;

const completionKinds = [
  "delivered",
  "merged",
  "blocked",
  "merge_blocked",
  "max_turns_reached",
  "rate_limited",
  "provider_transient",
  "stalled",
  "failure",
  "startup_failure"
] as const;

const nonStartupCompletionKinds = completionKinds.filter(
  (kind) => kind !== "startup_failure"
) as [
  "delivered",
  "merged",
  "blocked",
  "merge_blocked",
  "max_turns_reached",
  "rate_limited",
  "provider_transient",
  "stalled",
  "failure"
];

export type SymphonyCurrentFlowTrackerState = (typeof trackerStates)[number];
export type SymphonyCurrentFlowRunMode = (typeof runModes)[number];
export type SymphonyCurrentFlowDeliveryStatus = (typeof deliveryStatuses)[number];
export type SymphonyCurrentFlowMergeResultStatus =
  (typeof mergeResultStatuses)[number];
export type SymphonyCurrentFlowStateRequestKind = (typeof stateRequestKinds)[number];
export type SymphonyCurrentFlowStateRequestTargetState =
  (typeof stateRequestTargetStates)[number];
export type SymphonyCurrentFlowCompletionKind = (typeof completionKinds)[number];

const symphonyCurrentFlowTrackerStateSchema = z.enum(trackerStates);
const symphonyCurrentFlowRunModeSchema = z.enum(runModes);
const symphonyCurrentFlowDeliveryStatusSchema = z.enum(deliveryStatuses);
const symphonyCurrentFlowMergeResultStatusSchema = z.enum(mergeResultStatuses);
const symphonyCurrentFlowStateRequestKindSchema = z.enum(stateRequestKinds);
const symphonyCurrentFlowStateRequestTargetStateSchema = z.enum(
  stateRequestTargetStates
);
const symphonyCurrentFlowCompletionKindSchema = z.enum(completionKinds);
const symphonyCurrentFlowNonStartupCompletionKindSchema = z.enum(
  nonStartupCompletionKinds
);

const trackerStateObservedPayloadSchema = z
  .object({
    state: symphonyCurrentFlowTrackerStateSchema,
    runId: workflowNullableIdSchema,
    runMode: symphonyCurrentFlowRunModeSchema.nullable()
  })
  .strict();

const runStartedPayloadSchema = z
  .object({
    runId: workflowNullableIdSchema,
    runMode: symphonyCurrentFlowRunModeSchema
  })
  .strict();

const deliveryReportedPayloadSchema = z
  .object({
    runId: z.string().trim().min(1),
    status: symphonyCurrentFlowDeliveryStatusSchema
  })
  .strict();

const mergeResultReportedPayloadSchema = z
  .object({
    runId: z.string().trim().min(1),
    status: symphonyCurrentFlowMergeResultStatusSchema
  })
  .strict();

const stateRequestedPayloadSchema = z
  .object({
    runId: z.string().trim().min(1),
    requestKind: symphonyCurrentFlowStateRequestKindSchema,
    targetState: symphonyCurrentFlowStateRequestTargetStateSchema
  })
  .strict();

const runtimeCompletedPayloadSchema = z
  .object({
    kind: symphonyCurrentFlowNonStartupCompletionKindSchema,
    runId: workflowNullableIdSchema,
    runMode: symphonyCurrentFlowRunModeSchema,
    reason: z.string().trim().min(1).nullable()
  })
  .strict();

const runtimeStartupFailurePayloadSchema = z
  .object({
    kind: z.literal("startup_failure"),
    runId: workflowNullableIdSchema,
    runMode: symphonyCurrentFlowRunModeSchema,
    reason: z.string().trim().min(1),
    failureStage: z.string().trim().min(1),
    failureOrigin: z.string().trim().min(1)
  })
  .strict();

const runtimeShutdownRequestedPayloadSchema = z
  .object({
    runId: workflowNullableIdSchema,
    runMode: symphonyCurrentFlowRunModeSchema,
    reason: z.string().trim().min(1)
  })
  .strict();

const trackerStateObservedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("tracker.state_observed"),
    source: z.literal("tracker"),
    payload: trackerStateObservedPayloadSchema
  })
  .strict();

const runStartedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("runtime.run_started"),
    source: z.literal("runtime"),
    payload: runStartedPayloadSchema
  })
  .strict();

const deliveryReportedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("runtime.delivery_reported"),
    source: z.literal("runtime"),
    payload: deliveryReportedPayloadSchema
  })
  .strict();

const mergeResultReportedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("runtime.merge_result_reported"),
    source: z.literal("runtime"),
    payload: mergeResultReportedPayloadSchema
  })
  .strict();

const stateRequestedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("runtime.state_requested"),
    source: z.literal("runtime"),
    payload: stateRequestedPayloadSchema
  })
  .strict();

const runtimeCompletedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("runtime.completed"),
    source: z.literal("runtime"),
    payload: runtimeCompletedPayloadSchema
  })
  .strict();

const runtimeStartupFailureSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("runtime.startup_failure"),
    source: z.literal("runtime"),
    payload: runtimeStartupFailurePayloadSchema
  })
  .strict();

const runtimeShutdownRequestedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("runtime.shutdown_requested"),
    source: z.literal("runtime"),
    payload: runtimeShutdownRequestedPayloadSchema
  })
  .strict();

const trackerTransitionCommandSchema = workflowCommandSchema
  .extend({
    kind: z.literal("tracker.transition"),
    payload: z
      .object({
        state: symphonyCurrentFlowTrackerStateSchema
      })
      .strict()
  })
  .strict();

const dispatchCommandSchema = workflowCommandSchema
  .extend({
    kind: z.literal("run.dispatch"),
    payload: z
      .object({
        runMode: symphonyCurrentFlowRunModeSchema
      })
      .strict()
  })
  .strict();

export type SymphonyCurrentFlowTrackerStateObservedSignal = WorkflowSignal<
  "tracker.state_observed",
  z.infer<typeof trackerStateObservedPayloadSchema>
>;

export type SymphonyCurrentFlowRunStartedSignal = WorkflowSignal<
  "runtime.run_started",
  z.infer<typeof runStartedPayloadSchema>
>;

export type SymphonyCurrentFlowDeliveryReportedSignal = WorkflowSignal<
  "runtime.delivery_reported",
  z.infer<typeof deliveryReportedPayloadSchema>
>;

export type SymphonyCurrentFlowMergeResultReportedSignal = WorkflowSignal<
  "runtime.merge_result_reported",
  z.infer<typeof mergeResultReportedPayloadSchema>
>;

export type SymphonyCurrentFlowStateRequestedSignal = WorkflowSignal<
  "runtime.state_requested",
  z.infer<typeof stateRequestedPayloadSchema>
>;

export type SymphonyCurrentFlowRuntimeCompletedSignal = WorkflowSignal<
  "runtime.completed",
  z.infer<typeof runtimeCompletedPayloadSchema>
>;

export type SymphonyCurrentFlowRuntimeStartupFailureSignal = WorkflowSignal<
  "runtime.startup_failure",
  z.infer<typeof runtimeStartupFailurePayloadSchema>
>;

export type SymphonyCurrentFlowShutdownRequestedSignal = WorkflowSignal<
  "runtime.shutdown_requested",
  z.infer<typeof runtimeShutdownRequestedPayloadSchema>
>;

export type SymphonyCurrentFlowTrackerTransitionCommand = WorkflowCommand<
  "tracker.transition",
  z.infer<typeof trackerTransitionCommandSchema>["payload"]
>;

export type SymphonyCurrentFlowDispatchCommand = WorkflowCommand<
  "run.dispatch",
  z.infer<typeof dispatchCommandSchema>["payload"]
>;

export function createSymphonyCurrentFlowTrackerStateObservedSignal(input: {
  id: string;
  occurredAt: string;
  state: SymphonyCurrentFlowTrackerState;
  runId: string | null;
  runMode: SymphonyCurrentFlowRunMode | null;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyCurrentFlowTrackerStateObservedSignal {
  return trackerStateObservedSignalSchema.parse({
    id: input.id,
    type: "tracker.state_observed",
    source: "tracker",
    occurredAt: input.occurredAt,
    payload: {
      state: input.state,
      runId: input.runId,
      runMode: input.runMode
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCurrentFlowRunStartedSignal(input: {
  id: string;
  occurredAt: string;
  runId: string | null;
  runMode: SymphonyCurrentFlowRunMode;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyCurrentFlowRunStartedSignal {
  return runStartedSignalSchema.parse({
    id: input.id,
    type: "runtime.run_started",
    source: "runtime",
    occurredAt: input.occurredAt,
    payload: {
      runId: input.runId,
      runMode: input.runMode
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCurrentFlowDeliveryReportedSignal(input: {
  id: string;
  occurredAt: string;
  runId: string;
  status: SymphonyCurrentFlowDeliveryStatus;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyCurrentFlowDeliveryReportedSignal {
  return deliveryReportedSignalSchema.parse({
    id: input.id,
    type: "runtime.delivery_reported",
    source: "runtime",
    occurredAt: input.occurredAt,
    payload: {
      runId: input.runId,
      status: input.status
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCurrentFlowMergeResultReportedSignal(input: {
  id: string;
  occurredAt: string;
  runId: string;
  status: SymphonyCurrentFlowMergeResultStatus;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyCurrentFlowMergeResultReportedSignal {
  return mergeResultReportedSignalSchema.parse({
    id: input.id,
    type: "runtime.merge_result_reported",
    source: "runtime",
    occurredAt: input.occurredAt,
    payload: {
      runId: input.runId,
      status: input.status
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCurrentFlowStateRequestedSignal(input: {
  id: string;
  occurredAt: string;
  runId: string;
  requestKind: SymphonyCurrentFlowStateRequestKind;
  targetState: SymphonyCurrentFlowStateRequestTargetState;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyCurrentFlowStateRequestedSignal {
  return stateRequestedSignalSchema.parse({
    id: input.id,
    type: "runtime.state_requested",
    source: "runtime",
    occurredAt: input.occurredAt,
    payload: {
      runId: input.runId,
      requestKind: input.requestKind,
      targetState: input.targetState
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCurrentFlowRuntimeCompletedSignal(input: {
  id: string;
  occurredAt: string;
  kind: Exclude<SymphonyCurrentFlowCompletionKind, "startup_failure">;
  runId: string | null;
  runMode: SymphonyCurrentFlowRunMode;
  reason: string | null;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyCurrentFlowRuntimeCompletedSignal {
  return runtimeCompletedSignalSchema.parse({
    id: input.id,
    type: "runtime.completed",
    source: "runtime",
    occurredAt: input.occurredAt,
    payload: {
      kind: input.kind,
      runId: input.runId,
      runMode: input.runMode,
      reason: input.reason
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCurrentFlowRuntimeStartupFailureSignal(input: {
  id: string;
  occurredAt: string;
  runId: string | null;
  runMode: SymphonyCurrentFlowRunMode;
  reason: string;
  failureStage: string;
  failureOrigin: string;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyCurrentFlowRuntimeStartupFailureSignal {
  return runtimeStartupFailureSignalSchema.parse({
    id: input.id,
    type: "runtime.startup_failure",
    source: "runtime",
    occurredAt: input.occurredAt,
    payload: {
      kind: "startup_failure",
      runId: input.runId,
      runMode: input.runMode,
      reason: input.reason,
      failureStage: input.failureStage,
      failureOrigin: input.failureOrigin
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCurrentFlowShutdownRequestedSignal(input: {
  id: string;
  occurredAt: string;
  runId: string | null;
  runMode: SymphonyCurrentFlowRunMode;
  reason: string;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyCurrentFlowShutdownRequestedSignal {
  return runtimeShutdownRequestedSignalSchema.parse({
    id: input.id,
    type: "runtime.shutdown_requested",
    source: "runtime",
    occurredAt: input.occurredAt,
    payload: {
      runId: input.runId,
      runMode: input.runMode,
      reason: input.reason
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyCurrentFlowTrackerTransitionCommand(input: {
  id: string;
  state: SymphonyCurrentFlowTrackerState;
  dedupeKey: string | null;
}): SymphonyCurrentFlowTrackerTransitionCommand {
  return trackerTransitionCommandSchema.parse({
    id: input.id,
    kind: "tracker.transition",
    dedupeKey: input.dedupeKey,
    payload: {
      state: input.state
    }
  });
}

export function createSymphonyCurrentFlowDispatchCommand(input: {
  id: string;
  runMode: SymphonyCurrentFlowRunMode;
  dedupeKey: string | null;
}): SymphonyCurrentFlowDispatchCommand {
  return dispatchCommandSchema.parse({
    id: input.id,
    kind: "run.dispatch",
    dedupeKey: input.dedupeKey,
    payload: {
      runMode: input.runMode
    }
  });
}

export function parseSymphonyCurrentFlowTrackerState(
  value: string
): SymphonyCurrentFlowTrackerState {
  try {
    return symphonyCurrentFlowTrackerStateSchema.parse(value);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony current-flow tracker state: ${String(error)}`,
      { cause: error }
    );
  }
}

export function parseSymphonyCurrentFlowRunMode(
  value: string
): SymphonyCurrentFlowRunMode {
  try {
    return symphonyCurrentFlowRunModeSchema.parse(value);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony current-flow run mode: ${String(error)}`,
      { cause: error }
    );
  }
}

export function readSymphonyCurrentFlowTrackerStateObservedSignal(
  signal: WorkflowSignal
): SymphonyCurrentFlowTrackerStateObservedSignal | null {
  return readSignal({
    signal,
    expectedType: "tracker.state_observed",
    schema: trackerStateObservedSignalSchema,
    label: "tracker.state_observed"
  });
}

export function readSymphonyCurrentFlowRunStartedSignal(
  signal: WorkflowSignal
): SymphonyCurrentFlowRunStartedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.run_started",
    schema: runStartedSignalSchema,
    label: "runtime.run_started"
  });
}

export function readSymphonyCurrentFlowDeliveryReportedSignal(
  signal: WorkflowSignal
): SymphonyCurrentFlowDeliveryReportedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.delivery_reported",
    schema: deliveryReportedSignalSchema,
    label: "runtime.delivery_reported"
  });
}

export function readSymphonyCurrentFlowMergeResultReportedSignal(
  signal: WorkflowSignal
): SymphonyCurrentFlowMergeResultReportedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.merge_result_reported",
    schema: mergeResultReportedSignalSchema,
    label: "runtime.merge_result_reported"
  });
}

export function readSymphonyCurrentFlowStateRequestedSignal(
  signal: WorkflowSignal
): SymphonyCurrentFlowStateRequestedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.state_requested",
    schema: stateRequestedSignalSchema,
    label: "runtime.state_requested"
  });
}

export function readSymphonyCurrentFlowRuntimeCompletedSignal(
  signal: WorkflowSignal
): SymphonyCurrentFlowRuntimeCompletedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.completed",
    schema: runtimeCompletedSignalSchema,
    label: "runtime.completed"
  });
}

export function readSymphonyCurrentFlowRuntimeStartupFailureSignal(
  signal: WorkflowSignal
): SymphonyCurrentFlowRuntimeStartupFailureSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.startup_failure",
    schema: runtimeStartupFailureSignalSchema,
    label: "runtime.startup_failure"
  });
}

export function readSymphonyCurrentFlowShutdownRequestedSignal(
  signal: WorkflowSignal
): SymphonyCurrentFlowShutdownRequestedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.shutdown_requested",
    schema: runtimeShutdownRequestedSignalSchema,
    label: "runtime.shutdown_requested"
  });
}

export function readSymphonyCurrentFlowTrackerTransitionCommand(
  command: WorkflowCommand
): SymphonyCurrentFlowTrackerTransitionCommand | null {
  return readCommand(
    command,
    "tracker.transition",
    trackerTransitionCommandSchema,
    "tracker.transition"
  );
}

export function readSymphonyCurrentFlowDispatchCommand(
  command: WorkflowCommand
): SymphonyCurrentFlowDispatchCommand | null {
  return readCommand(
    command,
    "run.dispatch",
    dispatchCommandSchema,
    "run.dispatch"
  );
}

function readSignal<TSignal extends WorkflowSignal>(
  input: {
    signal: WorkflowSignal;
    expectedType: TSignal["type"];
    schema: z.ZodType<TSignal>;
    label: string;
  }
): TSignal | null {
  if (input.signal.type !== input.expectedType) {
    return null;
  }

  try {
    return input.schema.parse(input.signal);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony current-flow ${input.label} signal: ${String(error)}`,
      { cause: error }
    );
  }
}

function readCommand<TCommand extends WorkflowCommand>(
  command: WorkflowCommand,
  expectedKind: TCommand["kind"],
  schema: z.ZodType<TCommand>,
  label: string
): TCommand | null {
  if (command.kind !== expectedKind) {
    return null;
  }

  try {
    return schema.parse(command);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony current-flow ${label} command: ${String(error)}`,
      { cause: error }
    );
  }
}

export {
  symphonyCurrentFlowDeliveryStatusSchema,
  symphonyCurrentFlowMergeResultStatusSchema,
  symphonyCurrentFlowStateRequestKindSchema,
  symphonyCurrentFlowStateRequestTargetStateSchema,
  symphonyCurrentFlowCompletionKindSchema,
  symphonyCurrentFlowNonStartupCompletionKindSchema,
  symphonyCurrentFlowRunModeSchema,
  symphonyCurrentFlowTrackerStateSchema
};
