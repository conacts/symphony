import type {
  SymphonyReworkHandoff,
  SymphonyRunMode
} from "@symphony/runtime-contract";
import { isSymphonyReworkHandoff } from "@symphony/runtime-contract";
import { isSymphonyCurrentFlowMergeResultRecord } from "@symphony/router";
import type { RuntimeMergeResult } from "@symphony/runtime-tools";
import { z } from "zod";

const symphonyRunModeSchema = z.enum([
  "implementation",
  "rework",
  "approved_merge"
]);

const runtimeWorkflowLifecycleProjectionDataSchema = z.object({
  trackerState: z.string().nullable(),
  lastDispatchMode: symphonyRunModeSchema.nullable(),
  lastRunMode: symphonyRunModeSchema.nullable(),
  latestMergeResult: z.unknown().nullable(),
  latestReworkHandoff: z.unknown().nullable()
});

export type RuntimeWorkflowLifecycleProjectionData = z.infer<
  typeof runtimeWorkflowLifecycleProjectionDataSchema
>;

export function parseRuntimeWorkflowLifecycleProjectionData(input: {
  workflowId: string;
  data: unknown;
}): RuntimeWorkflowLifecycleProjectionData {
  try {
    return runtimeWorkflowLifecycleProjectionDataSchema.parse(input.data);
  } catch (error) {
    throw new TypeError(
      `Route workflow ${input.workflowId} has invalid lifecycle projection data.`,
      {
        cause: error
      }
    );
  }
}

export function readLastDispatchModeFromProjection(input: {
  workflowId: string;
  data: unknown;
}): SymphonyRunMode | null {
  return parseRuntimeWorkflowLifecycleProjectionData(input).lastDispatchMode;
}

export function readTrackerStateFromProjection(input: {
  workflowId: string;
  data: unknown;
}): string | null {
  return parseRuntimeWorkflowLifecycleProjectionData(input).trackerState;
}

export function readActiveRunModeFromProjection(input: {
  workflowId: string;
  data: unknown;
}): SymphonyRunMode {
  const projectionData = parseRuntimeWorkflowLifecycleProjectionData(input);

  if (projectionData.lastRunMode) {
    return projectionData.lastRunMode;
  }

  if (projectionData.lastDispatchMode) {
    return projectionData.lastDispatchMode;
  }

  throw new TypeError(
    `Route workflow ${input.workflowId} is missing an active run mode.`
  );
}

export function readLatestReworkHandoffFromProjection(input: {
  workflowId: string;
  data: unknown;
}): SymphonyReworkHandoff | null {
  const handoff = parseRuntimeWorkflowLifecycleProjectionData(input)
    .latestReworkHandoff;
  if (handoff === null) {
    return null;
  }

  if (isSymphonyReworkHandoff(handoff)) {
    return handoff;
  }

  throw new TypeError(
    `Route workflow ${input.workflowId} has invalid lifecycle rework handoff data.`
  );
}

export function readLatestMergeResultFromProjection(input: {
  workflowId: string;
  data: unknown;
  runId: string;
}): RuntimeMergeResult | null {
  const mergeResult = parseRuntimeWorkflowLifecycleProjectionData(input)
    .latestMergeResult;
  if (mergeResult === null) {
    return null;
  }

  if (!isSymphonyCurrentFlowMergeResultRecord(mergeResult)) {
    throw new TypeError(
      `Route workflow ${input.workflowId} has invalid lifecycle merge-result data.`
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
