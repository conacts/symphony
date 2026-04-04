"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { useRuntimeSummary } from "@/hooks/use-runtime-summary";
import { OverviewView } from "@/features/overview/components/overview-view";
import {
  buildRuntimeSummaryConnectionState,
  buildRuntimeSummaryViewModel
} from "@/features/overview/model/overview-view-model";

export function OverviewLiveScreen(input: {
  model: SymphonyDashboardFoundationModel;
}) {
  const runtimeSummaryState = useRuntimeSummary({
    stateUrl: input.model.runtimeSurface.stateUrl,
    websocketUrl: input.model.websocketUrl
  });

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
            runtimeSummaryState.now
          )
        : null,
    [runtimeSummaryState.now, runtimeSummaryState.runtimeSummary]
  );

  return (
    <ControlPlaneShell
      connection={connection}
      model={input.model}
      sidebarLoading={runtimeSummaryState.loading}
      sidebarRuntimeSummary={runtimeSummaryState.runtimeSummary}
    >
      <OverviewView
        connection={connection}
        error={runtimeSummaryState.error}
        loading={runtimeSummaryState.loading}
        runtimeSummary={runtimeSummaryViewModel}
      />
    </ControlPlaneShell>
  );
}
