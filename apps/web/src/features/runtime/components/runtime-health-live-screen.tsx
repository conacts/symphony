"use client";

import { useMemo } from "react";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import { RuntimeHealthView } from "@/features/runtime/components/runtime-health-view";
import { useRuntimeHealth } from "@/hooks/use-runtime-health";
import { useRuntimeLogs } from "@/features/runtime/hooks/use-runtime-logs";
import { useNow } from "@/hooks/use-now";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";

export function RuntimeHealthLiveScreen() {
  const model = useControlPlaneModel();
  const now = useNow();
  const healthState = useRuntimeHealth({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl
  });
  const logsState = useRuntimeLogs({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
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
    <ControlPlanePage connection={connection}>
      <RuntimeHealthView
        connection={connection}
        error={healthState.error ?? logsState.error}
        health={healthState.resource}
        runtimeLogs={logsState.resource}
        loading={healthState.loading}
        now={now}
      />
    </ControlPlanePage>
  );
}
