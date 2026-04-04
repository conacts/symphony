"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import { RuntimeRefreshPanel } from "@/components/runtime-refresh-panel";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import {
  buildRuntimeSummaryConnectionState,
  buildRuntimeSummaryViewModel
} from "@/core/runtime-summary-view-model";
import { useRuntimeRefreshAction } from "@/hooks/use-runtime-refresh-action";
import { useRuntimeSummary } from "@/hooks/use-runtime-summary";
import { OverviewView } from "@/features/overview/components/overview-view";

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
  const refreshAction = useRuntimeRefreshAction({
    refreshUrl: input.model.runtimeSurface.refreshUrl,
    onRequested: runtimeSummaryState.refreshRuntimeSummary
  });

  return (
    <ControlPlaneShell
      connection={connection}
      model={input.model}
      sidebarLoading={runtimeSummaryState.loading}
      sidebarRuntimeSummary={runtimeSummaryState.runtimeSummary}
    >
      <RuntimeRefreshPanel
        error={refreshAction.error}
        lastResult={refreshAction.lastResult}
        onRefresh={() => void refreshAction.triggerRefresh()}
        pending={refreshAction.pending}
      />
      <OverviewView
        connection={connection}
        error={runtimeSummaryState.error}
        loading={runtimeSummaryState.loading}
        runtimeSummary={runtimeSummaryViewModel}
      />
    </ControlPlaneShell>
  );
}
