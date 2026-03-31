"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import { RunDetailView } from "@/components/run-detail-view";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { buildRuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import { useRunDetail } from "@/hooks/use-run-detail";

export function RunDetailLiveScreen(input: {
  model: SymphonyDashboardFoundationModel;
  runId: string;
}) {
  const runDetailState = useRunDetail({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl,
    runId: input.runId
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: runDetailState.status,
        error: runDetailState.error,
        hasSnapshot: runDetailState.resource !== null
      }),
    [runDetailState.error, runDetailState.resource, runDetailState.status]
  );

  return (
    <ControlPlaneShell connection={connection} model={input.model}>
      <RunDetailView
        connection={connection}
        error={runDetailState.error}
        loading={runDetailState.loading}
        runDetail={runDetailState.resource}
      />
    </ControlPlaneShell>
  );
}
