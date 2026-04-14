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

const runtimeIntelligentFlowLifecycleProjectionDataSchema = z.object({
  trackerState: z.string().nullable(),
  lastDispatchMode: z.string().nullable(),
  lastRunMode: z.string().nullable(),
  latestMergeResult: z.unknown().nullable(),
  latestReworkHandoff: z.unknown().nullable()
});

type RuntimeIntelligentFlowLifecycleProjectionData = z.infer<
  typeof runtimeIntelligentFlowLifecycleProjectionDataSchema
>;

export function parseRuntimeIntelligentFlowLifecycleProjectionData(input: {
  workflowId: string;
  data: unknown;
}): RuntimeIntelligentFlowLifecycleProjectionData {
  try {
    return runtimeIntelligentFlowLifecycleProjectionDataSchema.parse(input.data);
  } catch (error) {
    throw new TypeError(
      `Route workflow ${input.workflowId} has invalid intelligent-flow lifecycle projection data.`,
      {
        cause: error
      }
    );
  }
}

export function readRuntimeIntelligentFlowTrackerStateFromProjection(input: {
  workflowId: string;
  data: unknown;
}): string | null {
  const trackerState =
    parseRuntimeIntelligentFlowLifecycleProjectionData(input).trackerState;
  if (trackerState === null) {
    return null;
  }

  return parseSymphonyCurrentFlowTrackerState(trackerState);
}

export function readRuntimeIntelligentFlowActiveRunModeFromProjection(input: {
  workflowId: string;
  data: unknown;
}): SymphonyRunMode {
  const projectionData = parseRuntimeIntelligentFlowLifecycleProjectionData(input);

  if (projectionData.lastRunMode !== null) {
    return parseSymphonyCurrentFlowRunMode(projectionData.lastRunMode);
  }

  throw new TypeError(
    `Route workflow ${input.workflowId} is missing an active run mode.`
  );
}

export function readRuntimeIntelligentFlowLastDispatchModeFromProjection(input: {
  workflowId: string;
  data: unknown;
}): SymphonyRunMode | null {
  const lastDispatchMode =
    parseRuntimeIntelligentFlowLifecycleProjectionData(input).lastDispatchMode;
  if (lastDispatchMode === null) {
    return null;
  }

  return parseSymphonyCurrentFlowRunMode(lastDispatchMode);
}

export function readRuntimeIntelligentFlowLatestReworkHandoffFromProjection(input: {
  workflowId: string;
  data: unknown;
}): SymphonyReworkHandoff | null {
  const handoff =
    parseRuntimeIntelligentFlowLifecycleProjectionData(input).latestReworkHandoff;
  if (handoff === null) {
    return null;
  }

  if (isSymphonyReworkHandoff(handoff)) {
    return handoff;
  }

  throw new TypeError(
    `Route workflow ${input.workflowId} has invalid intelligent-flow lifecycle rework handoff data.`
  );
}

export function readRuntimeIntelligentFlowLatestMergeResultFromProjection(input: {
  workflowId: string;
  data: unknown;
  runId: string;
}): RuntimeMergeResult | null {
  const mergeResult =
    parseRuntimeIntelligentFlowLifecycleProjectionData(input).latestMergeResult;
  if (mergeResult === null) {
    return null;
  }

  if (!isSymphonyCurrentFlowMergeResultRecord(mergeResult)) {
    throw new TypeError(
      `Route workflow ${input.workflowId} has invalid intelligent-flow lifecycle merge-result data.`
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
