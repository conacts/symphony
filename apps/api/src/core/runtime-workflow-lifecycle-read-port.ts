import type { SymphonyReworkHandoff } from "@symphony/runtime-contract";
import type { RuntimeMergeResult } from "@symphony/runtime-tools";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";

export type SymphonyRuntimeWorkflowLifecycleReadPort = {
  loadCurrentTrackerState(input: {
    issueIdentifier: string;
  }): Promise<string | null>;
  loadLatestReworkHandoff(input: {
    issueIdentifier: string;
  }): Promise<SymphonyReworkHandoff | null>;
  loadLatestMergeResult(input: {
    issueIdentifier: string;
    runId: string;
  }): Promise<RuntimeMergeResult | null>;
};

export function createRuntimeWorkflowLifecycleReadPort(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
}): SymphonyRuntimeWorkflowLifecycleReadPort {
  return {
    async loadCurrentTrackerState({ issueIdentifier }) {
      const loaded = await input.sessionLoader.loadHydrationByIssueIdentifier({
        issueIdentifier
      });
      if (!loaded?.hydrationState.snapshot) {
        return null;
      }

      return loaded.routing.module.runtimeAdapter.readTrackerStateFromProjection({
        workflowId: loaded.hydrationState.workflow.workflowId,
        data: loaded.hydrationState.snapshot.projection.data
      });
    },
    async loadLatestReworkHandoff({ issueIdentifier }) {
      const loaded = await input.sessionLoader.loadHydrationByIssueIdentifier({
        issueIdentifier
      });
      if (!loaded?.hydrationState.snapshot) {
        return null;
      }

      return loaded.routing.module.runtimeAdapter.readLatestReworkHandoffFromProjection({
        workflowId: loaded.hydrationState.workflow.workflowId,
        data: loaded.hydrationState.snapshot.projection.data
      });
    },
    async loadLatestMergeResult({ issueIdentifier, runId }) {
      const loaded = await input.sessionLoader.loadHydrationByIssueIdentifier({
        issueIdentifier
      });
      if (!loaded?.hydrationState.snapshot) {
        return null;
      }

      return loaded.routing.module.runtimeAdapter.readLatestMergeResultFromProjection({
        workflowId: loaded.hydrationState.workflow.workflowId,
        data: loaded.hydrationState.snapshot.projection.data,
        runId
      });
    }
  };
}
