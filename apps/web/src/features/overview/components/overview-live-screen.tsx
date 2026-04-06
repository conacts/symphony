"use client";

import { useMemo, useState } from "react";
import type { SymphonyForensicsSuccessMetricsQuery } from "@symphony/contracts";
import { buildFailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import { useAnalysisSample } from "@/features/analysis/hooks/use-analysis-sample";
import { useIssueIndex } from "@/features/issues/hooks/use-issue-index";
import { OverviewView } from "@/features/overview/components/overview-view";
import { useSuccessMetrics } from "@/features/overview/hooks/use-success-metrics";
import { buildOverviewSuccessMetricsViewModel } from "@/features/overview/model/overview-success-metrics";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { useControlPlaneRuntime } from "@/features/shared/components/control-plane-runtime-context";
import { useNow } from "@/hooks/use-now";
import {
  buildRuntimeSummaryConnectionState,
  buildRuntimeSummaryViewModel
} from "@/features/overview/model/overview-view-model";

export function buildOverviewSuccessMetricsQuery(
  now = Date.now()
): SymphonyForensicsSuccessMetricsQuery {
  return {
    timeRange: "30d",
    startedAfter: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  };
}

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
  const analysisSampleState = useAnalysisSample({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl
  });
  const [successMetricsQuery] = useState(() => buildOverviewSuccessMetricsQuery());
  const successMetricsState = useSuccessMetrics({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    query: successMetricsQuery
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
            now,
            analysisSampleState.resource
          )
        : null,
    [analysisSampleState.resource, now, runtimeSummaryState.runtimeSummary]
  );
  const failureAnalysis = useMemo(
    () =>
      issueIndexState.resource
        ? buildFailureAnalysisViewModel(issueIndexState.resource)
        : null,
    [issueIndexState.resource]
  );
  const successMetrics = useMemo(
    () =>
      successMetricsState.resource
        ? buildOverviewSuccessMetricsViewModel(successMetricsState.resource)
        : null,
    [successMetricsState.resource]
  );

  return (
    <ControlPlanePage connection={connection}>
      <OverviewView
        connection={connection}
        error={
          runtimeSummaryState.error ??
          analysisSampleState.error
        }
        failureAnalysis={failureAnalysis}
        failureAnalysisError={issueIndexState.error}
        loading={runtimeSummaryState.loading}
        runtimeSummary={runtimeSummaryViewModel}
        successMetrics={successMetrics}
        successMetricsError={successMetricsState.error}
      />
    </ControlPlanePage>
  );
}
