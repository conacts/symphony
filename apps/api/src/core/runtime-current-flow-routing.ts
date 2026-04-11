import {
  createSymphonyCurrentFlowDeliveryReportedSignal,
  createSymphonyCurrentFlowMergeResultReportedSignal,
  createSymphonyCurrentFlowReviewReworkRequestedSignal,
  createSymphonyCurrentFlowRouterPreset,
  createSymphonyCurrentFlowRunStartedSignal,
  createSymphonyCurrentFlowRuntimeCompletedSignal,
  createSymphonyCurrentFlowRuntimeStartupFailureSignal,
  createSymphonyCurrentFlowShutdownRequestedSignal,
  createSymphonyCurrentFlowStateRequestedSignal,
  createSymphonyCurrentFlowTrackerStateObservedSignal,
  parseSymphonyCurrentFlowTrackerState,
  readSymphonyCurrentFlowDispatchCommand,
  readSymphonyCurrentFlowTrackerTransitionCommand,
  symphonyCurrentFlowDeliveryStatusSchema,
  symphonyCurrentFlowStateRequestKindSchema,
  symphonyCurrentFlowStateRequestTargetStateSchema,
  type SymphonyCurrentFlowData,
  type SymphonyCurrentFlowNode,
  type SymphonyCurrentFlowPolicy,
  type WorkflowRouter
} from "@symphony/router";
import type { SymphonyTrackerConfig } from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";
import type { SymphonyRuntimeWorkflowPresetModule } from "./runtime-workflow-preset-registry.js";

export type SymphonyRuntimeCurrentFlowRouter = WorkflowRouter<
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
>;

export const runtimeCurrentFlowRuntimeRouterPresetModule =
  createCurrentFlowRuntimeRouterPresetModule();

function createCurrentFlowRuntimeRouterPresetModule(): SymphonyRuntimeWorkflowPresetModule<
  "current-flow",
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
> {
  return {
    presetId: "current-flow",
    preset: createSymphonyCurrentFlowRouterPreset(),
    runtimeAdapter: createCurrentFlowRuntimeWorkflowPresetAdapter(),
    assertTrackerContract(input) {
      assertCurrentFlowTrackerContract(input.trackerConfig);
    }
  };
}

function assertCurrentFlowTrackerContract(
  trackerConfig: SymphonyTrackerConfig
): void {
  assertTrackerStateValue(
    "claimTransitionToState",
    trackerConfig.claimTransitionToState,
    "Bootstrapping"
  );
  assertTrackerStateValue(
    "startupFailureTransitionToState",
    trackerConfig.startupFailureTransitionToState,
    "Failed"
  );
  assertTrackerStateValue(
    "pauseTransitionToState",
    trackerConfig.pauseTransitionToState,
    "Paused"
  );
  assertTrackerStateValue(
    "blockedTransitionToState",
    trackerConfig.blockedTransitionToState,
    "Blocked"
  );
  assertTrackerStateIncluded(
    "claimTransitionFromStates",
    trackerConfig.claimTransitionFromStates,
    "Todo"
  );
  assertTrackerStateIncluded(
    "claimTransitionFromStates",
    trackerConfig.claimTransitionFromStates,
    "Rework"
  );
  assertTrackerStateIncluded(
    "terminalStates",
    trackerConfig.terminalStates,
    "Done"
  );
  assertTrackerStateIncluded(
    "terminalStates",
    trackerConfig.terminalStates,
    "Canceled"
  );
}

function assertTrackerStateValue(
  fieldName: string,
  value: string | null,
  expected: string
): void {
  if (value === expected) {
    return;
  }

  throw new TypeError(
    `Current-flow routing requires tracker.${fieldName} to be ${JSON.stringify(expected)}. Received ${JSON.stringify(value)}.`
  );
}

function assertTrackerStateIncluded(
  fieldName: string,
  states: string[],
  expectedState: string
): void {
  if (states.includes(expectedState)) {
    return;
  }

  throw new TypeError(
    `Current-flow routing requires tracker.${fieldName} to include ${JSON.stringify(expectedState)}. Received ${JSON.stringify(states)}.`
  );
}

function createCurrentFlowRuntimeWorkflowPresetAdapter(): SymphonyRuntimeWorkflowPresetAdapter {
  return {
    createTrackerStateObservedSignal(input) {
      return createSymphonyCurrentFlowTrackerStateObservedSignal({
        id: input.id,
        occurredAt: input.occurredAt,
        state: parseSymphonyCurrentFlowTrackerState(input.trackerState),
        runId: input.runId,
        runMode: input.runMode,
        causationId: input.causationId,
        correlationId: input.correlationId
      });
    },
    createRunStartedSignal(input) {
      return createSymphonyCurrentFlowRunStartedSignal({
        id: input.id,
        occurredAt: input.occurredAt,
        runId: input.runId,
        runMode: input.runMode,
        causationId: input.causationId,
        correlationId: input.correlationId
      });
    },
    createRuntimeCompletionSignal(input) {
      if (input.completion.kind === "startup_failure") {
        return createSymphonyCurrentFlowRuntimeStartupFailureSignal({
          id: input.id,
          occurredAt: input.occurredAt,
          runId: input.runId,
          runMode: input.runMode,
          reason: input.completion.reason,
          failureStage: input.completion.failureStage,
          failureOrigin: input.completion.failureOrigin,
          causationId: input.causationId,
          correlationId: input.correlationId
        });
      }

      return createSymphonyCurrentFlowRuntimeCompletedSignal({
        id: input.id,
        occurredAt: input.occurredAt,
        kind: input.completion.kind,
        runId: input.runId,
        runMode: input.runMode,
        reason: "reason" in input.completion ? input.completion.reason : null,
        causationId: input.causationId,
        correlationId: input.correlationId
      });
    },
    createDeliveryReportedSignal(input) {
      return createSymphonyCurrentFlowDeliveryReportedSignal({
        id: input.id,
        occurredAt: input.occurredAt,
        runId: input.runId,
        status: symphonyCurrentFlowDeliveryStatusSchema.parse(input.status),
        causationId: input.causationId,
        correlationId: input.correlationId
      });
    },
    createMergeResultReportedSignal(input) {
      return createSymphonyCurrentFlowMergeResultReportedSignal({
        id: input.id,
        occurredAt: input.occurredAt,
        mergeResult: {
          runId: input.runId,
          status: input.mergeResult.status,
          summary: input.mergeResult.summary,
          prUrl: input.mergeResult.prUrl,
          mergeCommitSha: input.mergeResult.mergeCommitSha,
          blockingReason: input.mergeResult.blockingReason,
          testsSummary: input.mergeResult.testsSummary,
          recordedAt: input.occurredAt
        },
        causationId: input.causationId,
        correlationId: input.correlationId
      });
    },
    createReviewReworkRequestedSignal(input) {
      return createSymphonyCurrentFlowReviewReworkRequestedSignal({
        id: input.id,
        occurredAt: input.occurredAt,
        handoff: input.handoff,
        causationId: input.causationId,
        correlationId: input.correlationId
      });
    },
    createStateRequestedSignal(input) {
      return createSymphonyCurrentFlowStateRequestedSignal({
        id: input.id,
        occurredAt: input.occurredAt,
        runId: input.runId,
        requestKind: symphonyCurrentFlowStateRequestKindSchema.parse(
          input.requestKind
        ),
        targetState: symphonyCurrentFlowStateRequestTargetStateSchema.parse(
          input.targetState
        ),
        causationId: input.causationId,
        correlationId: input.correlationId
      });
    },
    createShutdownRequestedSignal(input) {
      return createSymphonyCurrentFlowShutdownRequestedSignal({
        id: input.id,
        occurredAt: input.occurredAt,
        runId: input.runId,
        runMode: input.runMode,
        reason: input.reason,
        causationId: input.causationId,
        correlationId: input.correlationId
      });
    },
    readTrackerTransitionState(command) {
      const trackerTransition =
        readSymphonyCurrentFlowTrackerTransitionCommand(command);
      if (trackerTransition) {
        return trackerTransition.payload.state;
      }

      throw new TypeError(
        `Route command is not a valid Symphony current-flow tracker.transition command: ${command.kind}.`
      );
    },
    readDispatchRunMode(command) {
      const dispatchCommand = readSymphonyCurrentFlowDispatchCommand(command);
      if (dispatchCommand) {
        return dispatchCommand.payload.runMode;
      }

      throw new TypeError(
        `Route command is not a valid Symphony current-flow run.dispatch command: ${command.kind}.`
      );
    }
  };
}
