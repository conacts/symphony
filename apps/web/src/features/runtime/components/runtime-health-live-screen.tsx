"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import { RuntimeHealthView } from "@/features/runtime/components/runtime-health-view";
import { useRuntimeHealth } from "@/hooks/use-runtime-health";
import { useRuntimeLogs } from "@/features/runtime/hooks/use-runtime-logs";

export function RuntimeHealthLiveScreen(input: {
  model: SymphonyDashboardFoundationModel;
}) {
  const healthState = useRuntimeHealth({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl
  });
  const logsState = useRuntimeLogs({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl,
    limit: 25
  });

  const connectionStatus =
    healthState.status === "degraded" || logsState.status === "degraded"
      ? "degraded"
      : healthState.status === "connected"
        ? "connected"
        : "connecting";

  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: connectionStatus,
        error: healthState.error ?? logsState.error,
        hasSnapshot: healthState.resource !== null
      }),
    [connectionStatus, healthState.error, healthState.resource, logsState.error]
  );

  return (
    <ControlPlaneShell connection={connection} model={input.model}>
      <RuntimeHealthView
        connection={connection}
        error={healthState.error ?? logsState.error}
        health={healthState.resource}
        runtimeLogs={logsState.resource}
        loading={healthState.loading}
      />
    </ControlPlaneShell>
  );
}
