import type {
  SymphonyReworkHandoff,
  SymphonyRunMode
} from "@symphony/runtime-contract";
import { isSymphonyReworkHandoff } from "@symphony/runtime-contract";
import type { RuntimeMergeResult } from "@symphony/runtime-tools";
import {
  isSymphonyCurrentFlowMergeResultRecord,
  parseSymphonyCurrentFlowRunMode,
  parseSymphonyCurrentFlowTrackerState
} from "@symphony/router";
import { z } from "zod";

const runtimeCurrentFlowLifecycleProjectionDataSchema = z.object({
  trackerState: z.string().nullable(),
  lastDispatchMode: z.string().nullable(),
  lastRunMode: z.string().nullable(),
  latestMergeResult: z.unknown().nullable(),
  latestReworkHandoff: z.unknown().nullable()
});

type RuntimeCurrentFlowLifecycleProjectionData = z.infer<
  typeof runtimeCurrentFlowLifecycleProjectionDataSchema
>;

export function parseRuntimeCurrentFlowLifecycleProjectionData(input: {
  workflowId: string;
  data: unknown;
}): RuntimeCurrentFlowLifecycleProjectionData {
  try {
    return runtimeCurrentFlowLifecycleProjectionDataSchema.parse(input.data);
  } catch (error) {
    throw new TypeError(
      `Route workflow ${input.workflowId} has invalid current-flow lifecycle projection data.`,
      {
        cause: error
      }
    );
  }
}

export function readRuntimeCurrentFlowTrackerStateFromProjection(input: {
  workflowId: string;
  data: unknown;
}): string | null {
  const trackerState =
    parseRuntimeCurrentFlowLifecycleProjectionData(input).trackerState;
  if (trackerState === null) {
    return null;
  }

  return parseSymphonyCurrentFlowTrackerState(trackerState);
}

export function readRuntimeCurrentFlowActiveRunModeFromProjection(input: {
  workflowId: string;
  data: unknown;
}): SymphonyRunMode {
  const projectionData = parseRuntimeCurrentFlowLifecycleProjectionData(input);

  if (projectionData.lastRunMode !== null) {
    return parseSymphonyCurrentFlowRunMode(projectionData.lastRunMode);
  }

  throw new TypeError(
    `Route workflow ${input.workflowId} is missing an active run mode.`
  );
}

export function readRuntimeCurrentFlowLastDispatchModeFromProjection(input: {
  workflowId: string;
  data: unknown;
}): SymphonyRunMode | null {
  const lastDispatchMode =
    parseRuntimeCurrentFlowLifecycleProjectionData(input).lastDispatchMode;
  if (lastDispatchMode === null) {
    return null;
  }

  return parseSymphonyCurrentFlowRunMode(lastDispatchMode);
}

export function readRuntimeCurrentFlowLatestReworkHandoffFromProjection(input: {
  workflowId: string;
  data: unknown;
}): SymphonyReworkHandoff | null {
  const handoff =
    parseRuntimeCurrentFlowLifecycleProjectionData(input).latestReworkHandoff;
  if (handoff === null) {
    return null;
  }

  if (isSymphonyReworkHandoff(handoff)) {
    return handoff;
  }

  throw new TypeError(
    `Route workflow ${input.workflowId} has invalid current-flow lifecycle rework handoff data.`
  );
}

export function readRuntimeCurrentFlowLatestMergeResultFromProjection(input: {
  workflowId: string;
  data: unknown;
  runId: string;
}): RuntimeMergeResult | null {
  const mergeResult =
    parseRuntimeCurrentFlowLifecycleProjectionData(input).latestMergeResult;
  if (mergeResult === null) {
    return null;
  }

  if (!isSymphonyCurrentFlowMergeResultRecord(mergeResult)) {
    throw new TypeError(
      `Route workflow ${input.workflowId} has invalid current-flow lifecycle merge-result data.`
    );
  }

  if (mergeResult.runId !== input.runId) {
    return null;
  }

  return {
    status: mergeResult.status,
    summary: mergeResult.summary,
    prUrl: mergeResult.prUrl,
    mergeCommitSha: mergeResult.mergeCommitSha,
    blockingReason: mergeResult.blockingReason,
    testsSummary: mergeResult.testsSummary
  };
}
