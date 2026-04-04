"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import { RuntimeHealthView } from "@/components/runtime-health-view";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import { useRuntimeHealth } from "@/hooks/use-runtime-health";

export function RuntimeHealthLiveScreen(input: {
  model: SymphonyDashboardFoundationModel;
}) {
  const healthState = useRuntimeHealth({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl
  });

  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: healthState.status,
        error: healthState.error,
        hasSnapshot: healthState.resource !== null
      }),
    [healthState.error, healthState.resource, healthState.status]
  );

  return (
    <ControlPlaneShell connection={connection} model={input.model}>
      <RuntimeHealthView
        connection={connection}
        error={healthState.error}
        health={healthState.resource}
        loading={healthState.loading}
      />
    </ControlPlaneShell>
  );
}
