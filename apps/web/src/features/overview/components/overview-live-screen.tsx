"use client";

import { useMemo } from "react";
import { buildFailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import { useIssueIndex } from "@/features/issues/hooks/use-issue-index";
import { OverviewView } from "@/features/overview/components/overview-view";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { useControlPlaneRuntime } from "@/features/shared/components/control-plane-runtime-context";
import { useNow } from "@/hooks/use-now";
import {
  buildRuntimeSummaryConnectionState,
  buildRuntimeSummaryViewModel
} from "@/features/overview/model/overview-view-model";

export function OverviewLiveScreen() {
  const model = useControlPlaneModel();
  const runtimeSummaryState = useControlPlaneRuntime();
  const issueIndexState = useIssueIndex({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    query: {
      timeRange: "all",
      sortBy: "lastActive",
      sortDirection: "desc"
    }
  });
  const now = useNow();

  const connection = buildRuntimeSummaryConnectionState({
    status: runtimeSummaryState.status,
    error: runtimeSummaryState.error,
    hasSnapshot: runtimeSummaryState.runtimeSummary !== null
  });
  const runtimeSummaryViewModel = useMemo(
    () =>
      runtimeSummaryState.runtimeSummary
        ? buildRuntimeSummaryViewModel(
            runtimeSummaryState.runtimeSummary,
            now
          )
        : null,
    [now, runtimeSummaryState.runtimeSummary]
  );
  const failureAnalysis = useMemo(
    () =>
      issueIndexState.resource
        ? buildFailureAnalysisViewModel(issueIndexState.resource)
        : null,
    [issueIndexState.resource]
  );

  return (
    <ControlPlanePage connection={connection}>
      <OverviewView
        connection={connection}
        error={runtimeSummaryState.error}
        failureAnalysis={failureAnalysis}
        failureAnalysisError={issueIndexState.error}
        loading={runtimeSummaryState.loading}
        runtimeSummary={runtimeSummaryViewModel}
      />
    </ControlPlanePage>
  );
}
