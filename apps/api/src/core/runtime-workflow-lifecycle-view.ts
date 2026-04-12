import type { SymphonyReworkHandoff } from "@symphony/runtime-contract";
import type { RuntimeMergeResult } from "@symphony/runtime-tools";

export type SymphonyRuntimeWorkflowLifecycleView = {
  workflowId: string;
  trackerState: string;
  latestReworkHandoff: SymphonyReworkHandoff | null;
  latestMergeResult: RuntimeMergeResult | null;
};
