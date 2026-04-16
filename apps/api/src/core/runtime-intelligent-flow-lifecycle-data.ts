import {
  parseSymphonyIntelligentFlowRunMode,
  parseSymphonyIntelligentFlowTrackerState
} from "@symphony/router";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import { z } from "zod";

const runtimeIntelligentFlowLifecycleProjectionDataSchema = z.object({
  trackerState: z.string().nullable(),
  lastDispatchMode: z.string().nullable(),
  lastRunMode: z.string().nullable()
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

  return parseSymphonyIntelligentFlowTrackerState(trackerState);
}

export function readRuntimeIntelligentFlowActiveRunModeFromProjection(input: {
  workflowId: string;
  data: unknown;
}): SymphonyRunMode {
  const projectionData = parseRuntimeIntelligentFlowLifecycleProjectionData(input);

  if (projectionData.lastRunMode !== null) {
    return parseSymphonyIntelligentFlowRunMode(projectionData.lastRunMode);
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

  return parseSymphonyIntelligentFlowRunMode(lastDispatchMode);
}
