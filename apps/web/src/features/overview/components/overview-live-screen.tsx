"use client";

import { useMemo } from "react";
import { OverviewView } from "@/features/overview/components/overview-view";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneRuntime } from "@/features/shared/components/control-plane-runtime-context";
import { useNow } from "@/hooks/use-now";
import {
  buildRuntimeSummaryConnectionState,
  buildRuntimeSummaryViewModel
} from "@/features/overview/model/overview-view-model";

export function OverviewLiveScreen() {
  const runtimeSummaryState = useControlPlaneRuntime();
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
            now
          )
        : null,
    [now, runtimeSummaryState.runtimeSummary]
  );

  return (
    <ControlPlanePage connection={connection}>
      <OverviewView
        connection={connection}
        error={runtimeSummaryState.error}
        loading={runtimeSummaryState.loading}
        runtimeSummary={runtimeSummaryViewModel}
      />
    </ControlPlanePage>
  );
}
