"use client";

import { useMemo } from "react";
import { PerformanceAnalysisView } from "@/features/analysis/components/performance-analysis-view";
import { usePerformanceAnalysis } from "@/features/analysis/hooks/use-performance-analysis";
import { buildPerformanceAnalysisViewModel } from "@/features/analysis/model/performance-analysis-view-model";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function PerformanceAnalysisLiveScreen() {
  const model = useControlPlaneModel();
  const performanceAnalysisState = usePerformanceAnalysis({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: performanceAnalysisState.status,
        error: performanceAnalysisState.error,
        hasSnapshot: performanceAnalysisState.resource !== null
      }),
    [
      performanceAnalysisState.error,
      performanceAnalysisState.resource,
      performanceAnalysisState.status
    ]
  );
  const performanceAnalysis = useMemo(
    () =>
      performanceAnalysisState.resource
        ? buildPerformanceAnalysisViewModel(performanceAnalysisState.resource)
        : null,
    [performanceAnalysisState.resource]
  );

  return (
    <ControlPlanePage connection={connection}>
      <PerformanceAnalysisView
        connection={connection}
        error={performanceAnalysisState.error}
        loading={performanceAnalysisState.loading}
        performanceAnalysis={performanceAnalysis}
      />
    </ControlPlanePage>
  );
}
