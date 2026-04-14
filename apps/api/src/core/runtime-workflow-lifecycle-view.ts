import type { SymphonyReworkHandoff } from "@symphony/runtime-contract";
import type { RuntimeMergeResult } from "./runtime-result-types.js";

export type SymphonyRuntimeWorkflowLifecycleView = {
  workflowId: string;
  trackerState: string;
  latestReworkHandoff: SymphonyReworkHandoff | null;
  latestMergeResult: RuntimeMergeResult | null;
};
