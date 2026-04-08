"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TokenAnalysisView } from "@/features/analysis/components/token-analysis-view";
import { useAnalysisSample } from "@/features/analysis/hooks/use-analysis-sample";
import {
  buildTokenAnalysisSearchParams,
  buildTokenAnalysisWindowStart,
  parseTokenAnalysisQueryFromSearchParams
} from "@/features/analysis/model/token-analysis-query-state";
import { buildTokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import type { AgentAnalysisSampleResource } from "@/features/analysis/hooks/load-agent-analysis-sample";

export function TokenAnalysisLiveScreen() {
  const model = useControlPlaneModel();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const query = useMemo(
    () => parseTokenAnalysisQueryFromSearchParams(searchParams),
    [searchParamsString]
  );
  const [queryNow] = useState(() => Date.now());
  const analysisSampleState = useAnalysisSample({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    repo: query.repo
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
  const filteredSample = useMemo(
    () => filterTokenAnalysisSample(analysisSampleState.resource, query, queryNow),
    [analysisSampleState.resource, query, queryNow]
  );
  const tokenAnalysis = useMemo(
    () => (filteredSample ? buildTokenAnalysisViewModel(filteredSample) : null),
    [filteredSample]
  );

  return (
    <ControlPlanePage connection={connection}>
      <TokenAnalysisView
        connection={connection}
        error={analysisSampleState.error}
        loading={analysisSampleState.loading}
        tokenAnalysis={tokenAnalysis}
        modelOptions={modelOptions}
        selectedModel={query.model}
        timeRange={query.timeRange}
        onModelChange={(nextModel) => {
          const nextSearchParams = buildTokenAnalysisSearchParams(searchParams, {
            model: nextModel,
            timeRange: query.timeRange
          });
          const nextSearch = nextSearchParams.toString();
          router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, {
            scroll: false
          });
        }}
        onTimeRangeChange={(timeRange) => {
          const nextSearchParams = buildTokenAnalysisSearchParams(searchParams, {
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

function filterTokenAnalysisSample(
  input: AgentAnalysisSampleResource | null,
  query: {
    model?: string;
    timeRange: "7d" | "30d" | "all";
  },
  now: number
): AgentAnalysisSampleResource | null {
  if (!input) {
    return null;
  }

  const windowStart = buildTokenAnalysisWindowStart(query.timeRange, now);
  const sampledRuns = input.sampledRuns.filter((sampledRun) => {
    if (query.model) {
      const runModel = sampledRun.artifacts.run.model ?? sampledRun.run.model;
      if (runModel !== query.model) {
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
