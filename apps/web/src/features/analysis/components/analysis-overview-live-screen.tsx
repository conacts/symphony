"use client";

import { useMemo } from "react";
import { AnalysisOverviewView } from "@/features/analysis/components/analysis-overview-view";
import { usePerformanceAnalysis } from "@/features/analysis/hooks/use-performance-analysis";
import { useTokenAnalysis } from "@/features/analysis/hooks/use-token-analysis";
import { buildAnalysisOverviewViewModel } from "@/features/analysis/model/analysis-overview-view-model";
import { buildFailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import { buildPerformanceAnalysisViewModel } from "@/features/analysis/model/performance-analysis-view-model";
import { buildTokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import { useIssueIndex } from "@/features/issues/hooks/use-issue-index";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function AnalysisOverviewLiveScreen() {
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
  const performanceState = usePerformanceAnalysis({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl
  });
  const tokenState = useTokenAnalysis({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl
  });

  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status:
          issueIndexState.status === "connected" &&
          performanceState.status === "connected" &&
          tokenState.status === "connected"
            ? "connected"
            : issueIndexState.status === "degraded" ||
                performanceState.status === "degraded" ||
                tokenState.status === "degraded"
              ? "degraded"
              : "connecting",
        error:
          issueIndexState.error ?? performanceState.error ?? tokenState.error ?? null,
        hasSnapshot:
          issueIndexState.resource !== null &&
          performanceState.resource !== null &&
          tokenState.resource !== null
      }),
    [
      issueIndexState.error,
      issueIndexState.resource,
      issueIndexState.status,
      performanceState.error,
      performanceState.resource,
      performanceState.status,
      tokenState.error,
      tokenState.resource,
      tokenState.status
    ]
  );

  const overview = useMemo(() => {
    const failureAnalysis = issueIndexState.resource
      ? buildFailureAnalysisViewModel(issueIndexState.resource)
      : null;
    const performanceAnalysis = performanceState.resource
      ? buildPerformanceAnalysisViewModel(performanceState.resource)
      : null;
    const tokenAnalysis = tokenState.resource
      ? buildTokenAnalysisViewModel(tokenState.resource)
      : null;

    if (!failureAnalysis && !performanceAnalysis && !tokenAnalysis) {
      return null;
    }

    return buildAnalysisOverviewViewModel({
      failureAnalysis,
      performanceAnalysis,
      tokenAnalysis
    });
  }, [issueIndexState.resource, performanceState.resource, tokenState.resource]);

  return (
    <ControlPlanePage connection={connection}>
      <AnalysisOverviewView
        connection={connection}
        error={issueIndexState.error ?? performanceState.error ?? tokenState.error}
        loading={
          issueIndexState.loading || performanceState.loading || tokenState.loading
        }
        overview={overview}
      />
    </ControlPlanePage>
  );
}
