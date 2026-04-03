"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import { RuntimeLogsView } from "@/components/runtime-logs-view";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { buildRuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import { useRuntimeLogs } from "@/hooks/use-runtime-logs";

export function RuntimeLogsLiveScreen(input: {
  model: SymphonyDashboardFoundationModel;
}) {
  const logsState = useRuntimeLogs({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl
  });

  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: logsState.status,
        error: logsState.error,
        hasSnapshot: logsState.resource !== null
      }),
    [logsState.error, logsState.resource, logsState.status]
  );

  return (
    <ControlPlaneShell connection={connection} model={input.model}>
      <RuntimeLogsView
        connection={connection}
        error={logsState.error}
        loading={logsState.loading}
        logs={logsState.resource}
      />
    </ControlPlaneShell>
  );
}
