"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SymphonyForensicsSuccessMetricsQuery } from "@symphony/contracts";
import { OverviewView } from "@/features/overview/components/overview-view";
import { useSuccessMetrics } from "@/features/overview/hooks/use-success-metrics";
import { buildOverviewSuccessMetricsViewModel } from "@/features/overview/model/overview-success-metrics";
import {
  buildOverviewSearchParams,
  buildOverviewSuccessMetricsQuery as buildOverviewSuccessMetricsQueryModel,
  parseOverviewTimeRange
} from "@/features/overview/model/overview-query-state";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { useControlPlaneRuntime } from "@/features/shared/components/control-plane-runtime-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function buildOverviewSuccessMetricsQuery(
  now = Date.now(),
  timeRange: "all" | "24h" | "7d" | "30d" = "7d"
): SymphonyForensicsSuccessMetricsQuery {
  return buildOverviewSuccessMetricsQueryModel({
    timeRange,
    now
  });
}

export function OverviewLiveScreen() {
  const model = useControlPlaneModel();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const runtimeSummaryState = useControlPlaneRuntime();
  const [successMetricsQueryNow] = useState(() => Date.now());
  const searchParamsString = searchParams.toString();
  const selectedTimeRange = useMemo(
    () => parseOverviewTimeRange(searchParams.get("timeRange")),
    [searchParamsString]
  );
  const successMetricsQuery = useMemo(
    () =>
      buildOverviewSuccessMetricsQuery(successMetricsQueryNow, selectedTimeRange),
    [selectedTimeRange, successMetricsQueryNow]
  );
  const successMetricsState = useSuccessMetrics({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    query: successMetricsQuery
  });

  function updateTimeRange(timeRange: "all" | "24h" | "7d" | "30d") {
    const nextSearchParams = buildOverviewSearchParams(searchParams, timeRange);
    const query = nextSearchParams.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, {
      scroll: false
    });
  }

  const connection = buildRuntimeSummaryConnectionState({
    status: runtimeSummaryState.status,
    error: runtimeSummaryState.error,
    hasSnapshot: runtimeSummaryState.runtimeSummary !== null
  });
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
        error={successMetricsState.error}
        loading={successMetricsState.loading}
        successMetrics={successMetrics}
        selectedTimeRange={selectedTimeRange}
        onTimeRangeChange={updateTimeRange}
      />
    </ControlPlanePage>
  );
}
