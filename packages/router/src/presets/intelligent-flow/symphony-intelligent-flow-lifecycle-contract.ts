import { z } from "zod";
import type { WorkflowCommand, WorkflowSignal } from "../../types/index.js";
import { workflowSignalSchema } from "../../types/schema.js";

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
  "Done",
  "Canceled",
  "Paused",
  "Blocked",
  "Failed"
] as const;

const runModes = [
  "implementation",
  "rework"
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

const reviewTriggerKinds = [
  "changes_requested_review",
  "review_comment",
  "manual_rework_comment"
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

export type SymphonyIntelligentFlowTrackerState = (typeof trackerStates)[number];
export type SymphonyIntelligentFlowRunMode = (typeof runModes)[number];
export type SymphonyIntelligentFlowDeliveryStatus = (typeof deliveryStatuses)[number];
export type SymphonyIntelligentFlowMergeResultStatus =
  (typeof mergeResultStatuses)[number];
export type SymphonyIntelligentFlowMergeResultRecord = {
  runId: string;
  status: SymphonyIntelligentFlowMergeResultStatus;
  summary: string;
  prUrl: string | null;
  mergeCommitSha: string | null;
  blockingReason: string | null;
  testsSummary: string | null;
  recordedAt: string;
};
export type SymphonyIntelligentFlowReviewTriggerKind =
  (typeof reviewTriggerKinds)[number];
export type SymphonyIntelligentFlowReviewReworkHandoff = {
  source: "github_review";
  triggerKind: SymphonyIntelligentFlowReviewTriggerKind;
  reviewContextUrl: string | null;
  pullRequestUrl: string | null;
  actorLogin: string | null;
  feedbackBody: string | null;
  recordedAt: string;
};
export type SymphonyIntelligentFlowStateRequestKind = (typeof stateRequestKinds)[number];
export type SymphonyIntelligentFlowStateRequestTargetState =
  (typeof stateRequestTargetStates)[number];
export type SymphonyIntelligentFlowCompletionKind = (typeof completionKinds)[number];

const symphonyIntelligentFlowTrackerStateSchema = z.enum(trackerStates);
const symphonyIntelligentFlowRunModeSchema = z.enum(runModes);
const symphonyIntelligentFlowDeliveryStatusSchema = z.enum(deliveryStatuses);
const symphonyIntelligentFlowMergeResultStatusSchema = z.enum(mergeResultStatuses);
const symphonyIntelligentFlowReviewTriggerKindSchema = z.enum(reviewTriggerKinds);
const symphonyIntelligentFlowStateRequestKindSchema = z.enum(stateRequestKinds);
const symphonyIntelligentFlowStateRequestTargetStateSchema = z.enum(
  stateRequestTargetStates
);
const symphonyIntelligentFlowCompletionKindSchema = z.enum(completionKinds);
const symphonyIntelligentFlowNonStartupCompletionKindSchema = z.enum(
  nonStartupCompletionKinds
);

const reviewReworkHandoffPayloadSchema = z
  .object({
    source: z.literal("github_review"),
    triggerKind: symphonyIntelligentFlowReviewTriggerKindSchema,
    reviewContextUrl: z.string().trim().min(1).nullable(),
    pullRequestUrl: z.string().trim().min(1).nullable(),
    actorLogin: z.string().trim().min(1).nullable(),
    feedbackBody: z.string().trim().min(1).nullable(),
    recordedAt: z.string().trim().min(1)
  })
  .strict();

const mergeResultRecordSchema = z
  .object({
    runId: z.string().trim().min(1),
    status: symphonyIntelligentFlowMergeResultStatusSchema,
    summary: z.string().trim().min(1),
    prUrl: z.string().trim().min(1).nullable(),
    mergeCommitSha: z.string().trim().min(1).nullable(),
    blockingReason: z.string().trim().min(1).nullable(),
    testsSummary: z.string().trim().min(1).nullable(),
    recordedAt: z.string().trim().min(1)
  })
  .strict();

const trackerStateObservedPayloadSchema = z
  .object({
    state: symphonyIntelligentFlowTrackerStateSchema,
    runId: workflowNullableIdSchema,
    runMode: symphonyIntelligentFlowRunModeSchema.nullable()
  })
  .strict();

const runStartedPayloadSchema = z
  .object({
    runId: workflowNullableIdSchema,
    runMode: symphonyIntelligentFlowRunModeSchema
  })
  .strict();

const deliveryReportedPayloadSchema = z
  .object({
    runId: z.string().trim().min(1),
    status: symphonyIntelligentFlowDeliveryStatusSchema
  })
  .strict();

const mergeResultReportedPayloadSchema = z
  .object({
    mergeResult: mergeResultRecordSchema
  })
  .strict();

const reviewReworkRequestedPayloadSchema = z
  .object({
    handoff: reviewReworkHandoffPayloadSchema
  })
  .strict();

const stateRequestedPayloadSchema = z
  .object({
    runId: z.string().trim().min(1),
    requestKind: symphonyIntelligentFlowStateRequestKindSchema,
    targetState: symphonyIntelligentFlowStateRequestTargetStateSchema
  })
  .strict();

const runtimeCompletedPayloadSchema = z
  .object({
    kind: symphonyIntelligentFlowNonStartupCompletionKindSchema,
    runId: workflowNullableIdSchema,
    runMode: symphonyIntelligentFlowRunModeSchema,
    reason: z.string().trim().min(1).nullable()
  })
  .strict();

const runtimeStartupFailurePayloadSchema = z
  .object({
    kind: z.literal("startup_failure"),
    runId: workflowNullableIdSchema,
    runMode: symphonyIntelligentFlowRunModeSchema,
    reason: z.string().trim().min(1),
    failureStage: z.string().trim().min(1),
    failureOrigin: z.string().trim().min(1)
  })
  .strict();

const runtimeShutdownRequestedPayloadSchema = z
  .object({
    runId: workflowNullableIdSchema,
    runMode: symphonyIntelligentFlowRunModeSchema,
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

const reviewReworkRequestedSignalSchema = workflowSignalSchema
  .extend({
    type: z.literal("review.rework_requested"),
    source: z.literal("review"),
    payload: reviewReworkRequestedPayloadSchema
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
        state: symphonyIntelligentFlowTrackerStateSchema
      })
      .strict()
  })
  .strict();

const dispatchCommandSchema = workflowCommandSchema
  .extend({
    kind: z.literal("run.dispatch"),
    payload: z
      .object({
        runMode: symphonyIntelligentFlowRunModeSchema
      })
      .strict()
  })
  .strict();

export type SymphonyIntelligentFlowTrackerStateObservedSignal = WorkflowSignal<
  "tracker.state_observed",
  z.infer<typeof trackerStateObservedPayloadSchema>
>;

export type SymphonyIntelligentFlowRunStartedSignal = WorkflowSignal<
  "runtime.run_started",
  z.infer<typeof runStartedPayloadSchema>
>;

export type SymphonyIntelligentFlowDeliveryReportedSignal = WorkflowSignal<
  "runtime.delivery_reported",
  z.infer<typeof deliveryReportedPayloadSchema>
>;

export type SymphonyIntelligentFlowMergeResultReportedSignal = WorkflowSignal<
  "runtime.merge_result_reported",
  z.infer<typeof mergeResultReportedPayloadSchema>
>;

export type SymphonyIntelligentFlowReviewReworkRequestedSignal = WorkflowSignal<
  "review.rework_requested",
  z.infer<typeof reviewReworkRequestedPayloadSchema>
>;

export type SymphonyIntelligentFlowStateRequestedSignal = WorkflowSignal<
  "runtime.state_requested",
  z.infer<typeof stateRequestedPayloadSchema>
>;

export type SymphonyIntelligentFlowRuntimeCompletedSignal = WorkflowSignal<
  "runtime.completed",
  z.infer<typeof runtimeCompletedPayloadSchema>
>;

export type SymphonyIntelligentFlowRuntimeStartupFailureSignal = WorkflowSignal<
  "runtime.startup_failure",
  z.infer<typeof runtimeStartupFailurePayloadSchema>
>;

export type SymphonyIntelligentFlowShutdownRequestedSignal = WorkflowSignal<
  "runtime.shutdown_requested",
  z.infer<typeof runtimeShutdownRequestedPayloadSchema>
>;

export type SymphonyIntelligentFlowTrackerTransitionCommand = WorkflowCommand<
  "tracker.transition",
  z.infer<typeof trackerTransitionCommandSchema>["payload"]
>;

export type SymphonyIntelligentFlowDispatchCommand = WorkflowCommand<
  "run.dispatch",
  z.infer<typeof dispatchCommandSchema>["payload"]
>;

export function createSymphonyIntelligentFlowTrackerStateObservedSignal(input: {
  id: string;
  occurredAt: string;
  state: SymphonyIntelligentFlowTrackerState;
  runId: string | null;
  runMode: SymphonyIntelligentFlowRunMode | null;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyIntelligentFlowTrackerStateObservedSignal {
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

export function createSymphonyIntelligentFlowRunStartedSignal(input: {
  id: string;
  occurredAt: string;
  runId: string | null;
  runMode: SymphonyIntelligentFlowRunMode;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyIntelligentFlowRunStartedSignal {
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

export function createSymphonyIntelligentFlowDeliveryReportedSignal(input: {
  id: string;
  occurredAt: string;
  runId: string;
  status: SymphonyIntelligentFlowDeliveryStatus;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyIntelligentFlowDeliveryReportedSignal {
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

export function createSymphonyIntelligentFlowMergeResultReportedSignal(input: {
  id: string;
  occurredAt: string;
  mergeResult: SymphonyIntelligentFlowMergeResultRecord;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyIntelligentFlowMergeResultReportedSignal {
  return mergeResultReportedSignalSchema.parse({
    id: input.id,
    type: "runtime.merge_result_reported",
    source: "runtime",
    occurredAt: input.occurredAt,
    payload: {
      mergeResult: input.mergeResult
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyIntelligentFlowReviewReworkRequestedSignal(input: {
  id: string;
  occurredAt: string;
  handoff: SymphonyIntelligentFlowReviewReworkHandoff;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyIntelligentFlowReviewReworkRequestedSignal {
  return reviewReworkRequestedSignalSchema.parse({
    id: input.id,
    type: "review.rework_requested",
    source: "review",
    occurredAt: input.occurredAt,
    payload: {
      handoff: input.handoff
    },
    causationId: input.causationId,
    correlationId: input.correlationId
  });
}

export function createSymphonyIntelligentFlowStateRequestedSignal(input: {
  id: string;
  occurredAt: string;
  runId: string;
  requestKind: SymphonyIntelligentFlowStateRequestKind;
  targetState: SymphonyIntelligentFlowStateRequestTargetState;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyIntelligentFlowStateRequestedSignal {
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

export function createSymphonyIntelligentFlowRuntimeCompletedSignal(input: {
  id: string;
  occurredAt: string;
  kind: Exclude<SymphonyIntelligentFlowCompletionKind, "startup_failure">;
  runId: string | null;
  runMode: SymphonyIntelligentFlowRunMode;
  reason: string | null;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyIntelligentFlowRuntimeCompletedSignal {
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

export function createSymphonyIntelligentFlowRuntimeStartupFailureSignal(input: {
  id: string;
  occurredAt: string;
  runId: string | null;
  runMode: SymphonyIntelligentFlowRunMode;
  reason: string;
  failureStage: string;
  failureOrigin: string;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyIntelligentFlowRuntimeStartupFailureSignal {
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

export function createSymphonyIntelligentFlowShutdownRequestedSignal(input: {
  id: string;
  occurredAt: string;
  runId: string | null;
  runMode: SymphonyIntelligentFlowRunMode;
  reason: string;
  causationId: string | null;
  correlationId: string | null;
}): SymphonyIntelligentFlowShutdownRequestedSignal {
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

export function createSymphonyIntelligentFlowTrackerTransitionCommand(input: {
  id: string;
  state: SymphonyIntelligentFlowTrackerState;
  dedupeKey: string | null;
}): SymphonyIntelligentFlowTrackerTransitionCommand {
  return trackerTransitionCommandSchema.parse({
    id: input.id,
    kind: "tracker.transition",
    dedupeKey: input.dedupeKey,
    payload: {
      state: input.state
    }
  });
}

export function createSymphonyIntelligentFlowDispatchCommand(input: {
  id: string;
  runMode: SymphonyIntelligentFlowRunMode;
  dedupeKey: string | null;
}): SymphonyIntelligentFlowDispatchCommand {
  return dispatchCommandSchema.parse({
    id: input.id,
    kind: "run.dispatch",
    dedupeKey: input.dedupeKey,
    payload: {
      runMode: input.runMode
    }
  });
}

export function isSymphonyIntelligentFlowMergeResultRecord(
  value: unknown
): value is SymphonyIntelligentFlowMergeResultRecord {
  return mergeResultRecordSchema.safeParse(value).success;
}

export function parseSymphonyIntelligentFlowTrackerState(
  value: string
): SymphonyIntelligentFlowTrackerState {
  try {
    return symphonyIntelligentFlowTrackerStateSchema.parse(value);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony intelligent-flow lifecycle tracker state: ${String(error)}`,
      { cause: error }
    );
  }
}

export function parseSymphonyIntelligentFlowRunMode(
  value: string
): SymphonyIntelligentFlowRunMode {
  try {
    return symphonyIntelligentFlowRunModeSchema.parse(value);
  } catch (error) {
    throw new TypeError(
      `Invalid Symphony intelligent-flow lifecycle run mode: ${String(error)}`,
      { cause: error }
    );
  }
}

export function readSymphonyIntelligentFlowTrackerStateObservedSignal(
  signal: WorkflowSignal
): SymphonyIntelligentFlowTrackerStateObservedSignal | null {
  return readSignal({
    signal,
    expectedType: "tracker.state_observed",
    schema: trackerStateObservedSignalSchema,
    label: "tracker.state_observed"
  });
}

export function readSymphonyIntelligentFlowRunStartedSignal(
  signal: WorkflowSignal
): SymphonyIntelligentFlowRunStartedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.run_started",
    schema: runStartedSignalSchema,
    label: "runtime.run_started"
  });
}

export function readSymphonyIntelligentFlowDeliveryReportedSignal(
  signal: WorkflowSignal
): SymphonyIntelligentFlowDeliveryReportedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.delivery_reported",
    schema: deliveryReportedSignalSchema,
    label: "runtime.delivery_reported"
  });
}

export function readSymphonyIntelligentFlowMergeResultReportedSignal(
  signal: WorkflowSignal
): SymphonyIntelligentFlowMergeResultReportedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.merge_result_reported",
    schema: mergeResultReportedSignalSchema,
    label: "runtime.merge_result_reported"
  });
}

export function readSymphonyIntelligentFlowReviewReworkRequestedSignal(
  signal: WorkflowSignal
): SymphonyIntelligentFlowReviewReworkRequestedSignal | null {
  return readSignal({
    signal,
    expectedType: "review.rework_requested",
    schema: reviewReworkRequestedSignalSchema,
    label: "review.rework_requested"
  });
}

export function readSymphonyIntelligentFlowStateRequestedSignal(
  signal: WorkflowSignal
): SymphonyIntelligentFlowStateRequestedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.state_requested",
    schema: stateRequestedSignalSchema,
    label: "runtime.state_requested"
  });
}

export function readSymphonyIntelligentFlowRuntimeCompletedSignal(
  signal: WorkflowSignal
): SymphonyIntelligentFlowRuntimeCompletedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.completed",
    schema: runtimeCompletedSignalSchema,
    label: "runtime.completed"
  });
}

export function readSymphonyIntelligentFlowRuntimeStartupFailureSignal(
  signal: WorkflowSignal
): SymphonyIntelligentFlowRuntimeStartupFailureSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.startup_failure",
    schema: runtimeStartupFailureSignalSchema,
    label: "runtime.startup_failure"
  });
}

export function readSymphonyIntelligentFlowShutdownRequestedSignal(
  signal: WorkflowSignal
): SymphonyIntelligentFlowShutdownRequestedSignal | null {
  return readSignal({
    signal,
    expectedType: "runtime.shutdown_requested",
    schema: runtimeShutdownRequestedSignalSchema,
    label: "runtime.shutdown_requested"
  });
}

export function readSymphonyIntelligentFlowTrackerTransitionCommand(
  command: WorkflowCommand
): SymphonyIntelligentFlowTrackerTransitionCommand | null {
  return readCommand(
    command,
    "tracker.transition",
    trackerTransitionCommandSchema,
    "tracker.transition"
  );
}

export function readSymphonyIntelligentFlowDispatchCommand(
  command: WorkflowCommand
): SymphonyIntelligentFlowDispatchCommand | null {
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
      `Invalid Symphony intelligent-flow lifecycle ${input.label} signal: ${String(
        error
      )}`,
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
      `Invalid Symphony intelligent-flow lifecycle ${label} command: ${String(
        error
      )}`,
      { cause: error }
    );
  }
}

export {
  symphonyIntelligentFlowDeliveryStatusSchema,
  symphonyIntelligentFlowMergeResultStatusSchema,
  symphonyIntelligentFlowReviewTriggerKindSchema,
  symphonyIntelligentFlowStateRequestKindSchema,
  symphonyIntelligentFlowStateRequestTargetStateSchema,
  symphonyIntelligentFlowCompletionKindSchema,
  symphonyIntelligentFlowNonStartupCompletionKindSchema,
  symphonyIntelligentFlowRunModeSchema,
  symphonyIntelligentFlowTrackerStateSchema
};
