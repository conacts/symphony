"use client";

import { useMemo } from "react";
import { FailureAnalysisView } from "@/features/analysis/components/failure-analysis-view";
import { buildFailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import { useIssueIndex } from "@/features/issues/hooks/use-issue-index";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function FailureAnalysisLiveScreen() {
  const model = useControlPlaneModel();
  const issueIndexState = useIssueIndex({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    query: {
      timeRange: "all",
      sortBy: "lastActive",
      sortDirection: "desc"
    }
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: issueIndexState.status,
        error: issueIndexState.error,
        hasSnapshot: issueIndexState.resource !== null
      }),
    [issueIndexState.error, issueIndexState.resource, issueIndexState.status]
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
      <FailureAnalysisView
        connection={connection}
        error={issueIndexState.error}
        loading={issueIndexState.loading}
        failureAnalysis={failureAnalysis}
      />
    </ControlPlanePage>
  );
}
