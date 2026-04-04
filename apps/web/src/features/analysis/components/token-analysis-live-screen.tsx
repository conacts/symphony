"use client";

import { useMemo } from "react";
import { TokenAnalysisView } from "@/features/analysis/components/token-analysis-view";
import { useTokenAnalysis } from "@/features/analysis/hooks/use-token-analysis";
import { buildTokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function TokenAnalysisLiveScreen() {
  const model = useControlPlaneModel();
  const tokenAnalysisState = useTokenAnalysis({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: tokenAnalysisState.status,
        error: tokenAnalysisState.error,
        hasSnapshot: tokenAnalysisState.resource !== null
      }),
    [
      tokenAnalysisState.error,
      tokenAnalysisState.resource,
      tokenAnalysisState.status
    ]
  );
  const tokenAnalysis = useMemo(
    () =>
      tokenAnalysisState.resource
        ? buildTokenAnalysisViewModel(tokenAnalysisState.resource)
        : null,
    [tokenAnalysisState.resource]
  );

  return (
    <ControlPlanePage connection={connection}>
      <TokenAnalysisView
        connection={connection}
        error={tokenAnalysisState.error}
        loading={tokenAnalysisState.loading}
        tokenAnalysis={tokenAnalysis}
      />
    </ControlPlanePage>
  );
}
