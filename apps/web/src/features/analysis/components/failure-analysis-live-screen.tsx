"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FailureAnalysisView } from "@/features/analysis/components/failure-analysis-view";
import { useAnalysisSample } from "@/features/analysis/hooks/use-analysis-sample";
import {
  buildFailureAnalysisSearchParams,
  buildFailureAnalysisWindowStart,
  parseFailureAnalysisQueryFromSearchParams
} from "@/features/analysis/model/failure-analysis-query-state";
import { buildFailureAnalysisViewModelFromSample } from "@/features/analysis/model/failure-analysis-view-model";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { useControlPlaneRepoContext } from "@/features/shared/components/control-plane-repo-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import type { AgentAnalysisSampleResource } from "@/features/analysis/hooks/load-agent-analysis-sample";

export function FailureAnalysisLiveScreen() {
  const model = useControlPlaneModel();
  const repoContext = useControlPlaneRepoContext();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const query = useMemo(
    () => parseFailureAnalysisQueryFromSearchParams(searchParams),
    [searchParamsString]
  );
  const [queryNow] = useState(() => Date.now());
  const analysisSampleState = useAnalysisSample({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    repo: repoContext.selectedRepo
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
  const modelOptions = useMemo(
    () => buildModelOptions(analysisSampleState.resource),
    [analysisSampleState.resource]
  );
  const windowStart = useMemo(
    () => buildFailureAnalysisWindowStart(query.timeRange, queryNow),
    [query.timeRange, queryNow]
  );
  const filteredSample = useMemo(
    () =>
      filterFailureAnalysisSample(
        analysisSampleState.resource,
        query.model,
        windowStart
      ),
    [analysisSampleState.resource, query.model, windowStart]
  );
  const failureAnalysis = useMemo(
    () =>
      filteredSample
        ? buildFailureAnalysisViewModelFromSample(filteredSample, {
            timeRange: query.timeRange,
            now: queryNow
          })
        : null,
    [filteredSample, query.timeRange, queryNow]
  );

  return (
    <ControlPlanePage connection={connection}>
      <FailureAnalysisView
        connection={connection}
        error={analysisSampleState.error}
        loading={analysisSampleState.loading}
        failureAnalysis={failureAnalysis}
        selectedModel={query.model}
        modelOptions={modelOptions}
        timeRange={query.timeRange}
        onModelChange={(nextModel) => {
          const nextSearchParams = buildFailureAnalysisSearchParams(searchParams, {
            model: nextModel,
            timeRange: query.timeRange
          });
          const nextSearch = nextSearchParams.toString();
          router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, {
            scroll: false
          });
        }}
        onTimeRangeChange={(timeRange) => {
          const nextSearchParams = buildFailureAnalysisSearchParams(searchParams, {
            model: query.model,
            timeRange
          });
          const nextSearch = nextSearchParams.toString();
          router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, {
            scroll: false
          });
        }}
      />
    </ControlPlanePage>
  );
}

function buildModelOptions(input: AgentAnalysisSampleResource | null) {
  if (!input) {
    return [];
  }

  const models = new Map<string, string>();

  for (const sampledRun of input.sampledRuns) {
    const model = sampledRun.artifacts.run.model ?? sampledRun.run.model;

    if (model) {
      models.set(model, model);
    }
  }

  return [...models.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function filterFailureAnalysisSample(
  input: AgentAnalysisSampleResource | null,
  model: string | undefined,
  windowStart: number | null
): AgentAnalysisSampleResource | null {
  if (!input) {
    return null;
  }

  const sampledRuns = input.sampledRuns.filter((sampledRun) => {
    if (model) {
      const runModel = sampledRun.artifacts.run.model ?? sampledRun.run.model;
      if (runModel !== model) {
        return false;
      }
    }

    if (windowStart === null) {
      return true;
    }

    return Date.parse(sampledRun.run.startedAt) >= windowStart;
  });

  return {
    ...input,
    sampledRuns
  };
}
