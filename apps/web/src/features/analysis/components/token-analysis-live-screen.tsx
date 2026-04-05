"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TokenAnalysisView } from "@/features/analysis/components/token-analysis-view";
import { useAnalysisSample } from "@/features/analysis/hooks/use-analysis-sample";
import {
  buildAnalysisSearchParams,
  buildAnalysisQueryFromSearchParams
} from "@/features/analysis/model/analysis-query-state";
import {
  buildAnalysisFilterOptions,
  countSampledIssues,
  filterCodexAnalysisSample
} from "@/features/analysis/model/analysis-sample-filter";
import { buildTokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function TokenAnalysisLiveScreen() {
  const model = useControlPlaneModel();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(
    () => buildAnalysisQueryFromSearchParams(searchParams),
    [searchParams]
  );
  const analysisSampleState = useAnalysisSample({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: analysisSampleState.status,
        error: analysisSampleState.error,
        hasSnapshot: analysisSampleState.resource !== null
      }),
    [
      analysisSampleState.error,
      analysisSampleState.resource,
      analysisSampleState.status
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
  const tokenAnalysis = useMemo(
    () =>
      filteredSample
        ? buildTokenAnalysisViewModel(filteredSample)
        : null,
    [filteredSample]
  );

  return (
    <ControlPlanePage connection={connection}>
      <TokenAnalysisView
        connection={connection}
        error={analysisSampleState.error}
        loading={analysisSampleState.loading}
        tokenAnalysis={tokenAnalysis}
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
