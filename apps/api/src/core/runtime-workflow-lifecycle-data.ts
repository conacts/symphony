import type { SymphonyRunMode } from "@symphony/runtime-contract";
import { z } from "zod";

const symphonyRunModeSchema = z.enum([
  "implementation",
  "rework",
  "approved_merge"
]);

const runtimeWorkflowLifecycleProjectionDataSchema = z.object({
  trackerState: z.string().nullable(),
  lastDispatchMode: symphonyRunModeSchema.nullable(),
  lastRunMode: symphonyRunModeSchema.nullable()
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
