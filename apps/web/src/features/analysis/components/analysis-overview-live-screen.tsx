"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnalysisOverviewView } from "@/features/analysis/components/analysis-overview-view";
import { useAnalysisSample } from "@/features/analysis/hooks/use-analysis-sample";
import { buildAnalysisOverviewViewModel } from "@/features/analysis/model/analysis-overview-view-model";
import {
  buildAnalysisSearchParams,
  buildAnalysisQueryFromSearchParams,
  hasActiveAnalysisFilters
} from "@/features/analysis/model/analysis-query-state";
import {
  buildAnalysisFilterOptions,
  countSampledIssues,
  filterCodexAnalysisSample
} from "@/features/analysis/model/analysis-sample-filter";
import {
  buildFailureAnalysisViewModel,
  buildFailureAnalysisViewModelFromSample
} from "@/features/analysis/model/failure-analysis-view-model";
import { buildPerformanceAnalysisViewModel } from "@/features/analysis/model/performance-analysis-view-model";
import { buildTokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import { useIssueIndex } from "@/features/issues/hooks/use-issue-index";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function AnalysisOverviewLiveScreen() {
  const model = useControlPlaneModel();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(
    () => buildAnalysisQueryFromSearchParams(searchParams),
    [searchParams]
  );
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

  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status:
          issueIndexState.status === "connected" &&
          analysisSampleState.status === "connected"
            ? "connected"
            : issueIndexState.status === "degraded" || analysisSampleState.status === "degraded"
              ? "degraded"
              : "connecting",
        error: issueIndexState.error ?? analysisSampleState.error ?? null,
        hasSnapshot:
          issueIndexState.resource !== null &&
          analysisSampleState.resource !== null
      }),
    [
      analysisSampleState.error,
      analysisSampleState.resource,
      analysisSampleState.status,
      issueIndexState.error,
      issueIndexState.resource,
      issueIndexState.status
    ]
  );
  const filterOptions = useMemo(
    () =>
      analysisSampleState.resource
        ? buildAnalysisFilterOptions(analysisSampleState.resource)
        : {
            harnesses: [],
            providers: [],
            models: []
          },
    [analysisSampleState.resource]
  );
  const filteredSample = useMemo(
    () =>
      analysisSampleState.resource
        ? filterCodexAnalysisSample(analysisSampleState.resource, query)
        : null,
    [analysisSampleState.resource, query]
  );

  const overview = useMemo(() => {
    const failureAnalysis = hasActiveAnalysisFilters(query)
      ? filteredSample
        ? buildFailureAnalysisViewModelFromSample(filteredSample)
        : null
      : issueIndexState.resource
        ? buildFailureAnalysisViewModel(issueIndexState.resource)
        : null;
    const performanceAnalysis = filteredSample
      ? buildPerformanceAnalysisViewModel(filteredSample)
      : null;
    const tokenAnalysis = filteredSample
      ? buildTokenAnalysisViewModel(filteredSample)
      : null;

    if (!failureAnalysis && !performanceAnalysis && !tokenAnalysis) {
      return null;
    }

    return buildAnalysisOverviewViewModel({
      failureAnalysis,
      performanceAnalysis,
      tokenAnalysis
    });
  }, [filteredSample, issueIndexState.resource, query]);

  return (
    <ControlPlanePage connection={connection}>
      <AnalysisOverviewView
        connection={connection}
        error={issueIndexState.error ?? analysisSampleState.error}
        loading={issueIndexState.loading || analysisSampleState.loading}
        overview={overview}
        query={query}
        filterOptions={filterOptions}
        sampledRunCount={filteredSample?.sampledRuns.length ?? 0}
        sampledIssueCount={filteredSample ? countSampledIssues(filteredSample) : 0}
        onQueryChange={(nextQuery) => {
          const nextSearch = buildAnalysisSearchParams(nextQuery).toString();
          router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, {
            scroll: false
          });
        }}
      />
    </ControlPlanePage>
  );
}
