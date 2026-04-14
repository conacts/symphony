import {
  type WorkflowRouterPreset,
  createSymphonyCurrentFlowDeliveryReportedSignal,
  createSymphonyCurrentFlowMergeResultReportedSignal,
  createSymphonyCurrentFlowReviewReworkRequestedSignal,
  createSymphonyCurrentFlowRunStartedSignal,
  createSymphonyCurrentFlowRuntimeCompletedSignal,
  createSymphonyCurrentFlowRuntimeStartupFailureSignal,
  createSymphonyCurrentFlowShutdownRequestedSignal,
  createSymphonyCurrentFlowStateRequestedSignal,
  createSymphonyCurrentFlowTrackerStateObservedSignal,
  createSymphonyIntelligentFlowRouterPreset,
  parseSymphonyCurrentFlowTrackerState,
  readSymphonyCurrentFlowDispatchCommand,
  readSymphonyCurrentFlowTrackerTransitionCommand,
  symphonyCurrentFlowDeliveryStatusSchema,
  symphonyCurrentFlowStateRequestKindSchema,
  symphonyCurrentFlowStateRequestTargetStateSchema,
  type SymphonyIntelligentFlowData,
  type SymphonyIntelligentFlowNode,
  type SymphonyIntelligentFlowPolicy,
  type WorkflowRouter
} from "@symphony/router";
import {
  normalizeIssueState,
  type SymphonyTrackerConfig
} from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";
import type { SymphonyRuntimeWorkflowPresetModule } from "./runtime-workflow-preset-registry.js";
import {
  readRuntimeIntelligentFlowActiveRunModeFromProjection,
  readRuntimeIntelligentFlowLastDispatchModeFromProjection,
  readRuntimeIntelligentFlowLatestMergeResultFromProjection,
  readRuntimeIntelligentFlowLatestReworkHandoffFromProjection,
  readRuntimeIntelligentFlowTrackerStateFromProjection
} from "./runtime-intelligent-flow-lifecycle-data.js";

export type SymphonyRuntimeIntelligentFlowRouter = WorkflowRouter<
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowPolicy
>;

export const runtimeIntelligentFlowRuntimeRouterPresetModule =
  createRuntimeIntelligentFlowPresetModule({
    presetId: "intelligent-flow",
    preset: createSymphonyIntelligentFlowRouterPreset()
  });

export function createRuntimeIntelligentFlowPresetModule<
  PresetId extends string,
>(input: {
  presetId: PresetId;
  preset: WorkflowRouterPreset<
    SymphonyIntelligentFlowNode,
    SymphonyIntelligentFlowData,
    SymphonyIntelligentFlowPolicy
  >;
}): SymphonyRuntimeWorkflowPresetModule<
  PresetId,
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowPolicy
> {
  return {
    presetId: input.presetId,
    preset: input.preset,
    runtimeAdapter: createIntelligentFlowRuntimeWorkflowPresetAdapter(),
    requiredNonRunningTrackerSeedStates: ["Bootstrapping"],
    assertTrackerContract(input) {
      assertIntelligentFlowTrackerContract(input.trackerConfig);
    }
  };
}

function assertIntelligentFlowTrackerContract(
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
  if (normalizeIssueState(value) === normalizeIssueState(expected)) {
    return;
  }

  throw new TypeError(
    `Intelligent-flow routing requires tracker.${fieldName} to be ${JSON.stringify(expected)}. Received ${JSON.stringify(value)}.`
  );
}

function assertTrackerStateIncluded(
  fieldName: string,
  states: string[],
  expectedState: string
): void {
  if (
    states.some(
      (state) => normalizeIssueState(state) === normalizeIssueState(expectedState)
    )
  ) {
    return;
  }

  throw new TypeError(
    `Intelligent-flow routing requires tracker.${fieldName} to include ${JSON.stringify(expectedState)}. Received ${JSON.stringify(states)}.`
  );
}

function createIntelligentFlowRuntimeWorkflowPresetAdapter(): SymphonyRuntimeWorkflowPresetAdapter {
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
        kind: normalizeLegacyRuntimeCompletionKind(input.completion.kind),
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
    readTrackerStateFromProjection(input) {
      return readRuntimeIntelligentFlowTrackerStateFromProjection(input);
    },
    shouldObserveUnchangedIdleTrackerState(input) {
      const trackerState = parseSymphonyCurrentFlowTrackerState(input.trackerState);
      return input.currentNode === "claimed" && trackerState === "Bootstrapping";
    },
    readLastDispatchModeFromProjection(input) {
      return readRuntimeIntelligentFlowLastDispatchModeFromProjection(input);
    },
    readActiveRunModeFromProjection(input) {
      return readRuntimeIntelligentFlowActiveRunModeFromProjection(input);
    },
    readLatestReworkHandoffFromProjection(input) {
      return readRuntimeIntelligentFlowLatestReworkHandoffFromProjection(input);
    },
    readLatestMergeResultFromProjection(input) {
      return readRuntimeIntelligentFlowLatestMergeResultFromProjection(input);
    },
    readTrackerTransitionState(command) {
      const trackerTransition =
        readSymphonyCurrentFlowTrackerTransitionCommand(command);
      if (trackerTransition) {
        return trackerTransition.payload.state;
      }

      throw new TypeError(
        `Route command is not a valid Symphony intelligent-flow tracker.transition command: ${command.kind}.`
      );
    },
    readDispatchRunMode(command) {
      const dispatchCommand = readSymphonyCurrentFlowDispatchCommand(command);
      if (dispatchCommand) {
        return dispatchCommand.payload.runMode;
      }

      throw new TypeError(
        `Route command is not a valid Symphony intelligent-flow run.dispatch command: ${command.kind}.`
      );
    }
  };
}

function normalizeLegacyRuntimeCompletionKind(
  kind:
    | Parameters<typeof createSymphonyCurrentFlowRuntimeCompletedSignal>[0]["kind"]
    | "awaiting_input"
    | "invalid_result"
    | "missing_terminal_result"
): Parameters<typeof createSymphonyCurrentFlowRuntimeCompletedSignal>[0]["kind"] {
  switch (kind) {
    case "awaiting_input":
    case "invalid_result":
    case "missing_terminal_result":
      return "failure";
    default:
      return kind;
  }
}
