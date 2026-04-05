"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FailureAnalysisView } from "@/features/analysis/components/failure-analysis-view";
import { useAnalysisSample } from "@/features/analysis/hooks/use-analysis-sample";
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
import { useIssueIndex } from "@/features/issues/hooks/use-issue-index";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function FailureAnalysisLiveScreen() {
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
            : issueIndexState.status === "degraded" ||
                analysisSampleState.status === "degraded"
              ? "degraded"
              : "connecting",
        error: issueIndexState.error ?? analysisSampleState.error,
        hasSnapshot:
          issueIndexState.resource !== null && analysisSampleState.resource !== null
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
  const failureAnalysis = useMemo(
    () => {
      if (hasActiveAnalysisFilters(query)) {
        return filteredSample
          ? buildFailureAnalysisViewModelFromSample(filteredSample)
          : null;
      }

      return issueIndexState.resource
        ? buildFailureAnalysisViewModel(issueIndexState.resource)
        : null;
    },
    [filteredSample, issueIndexState.resource, query]
  );

  return (
    <ControlPlanePage connection={connection}>
      <FailureAnalysisView
        connection={connection}
        error={issueIndexState.error ?? analysisSampleState.error}
        loading={issueIndexState.loading || analysisSampleState.loading}
        failureAnalysis={failureAnalysis}
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
