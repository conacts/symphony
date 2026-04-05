"use client";

import React, { useMemo } from "react";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import { useAgentRun } from "@/features/runs/hooks/use-agent-run";
import { RunTurnsView } from "@/features/runs/components/run-turns-view";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";

export function RunTurnsLiveScreen(input: { runId: string }) {
  const model = useControlPlaneModel();
  const runState = useAgentRun({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    runId: input.runId
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: runState.status,
        error: runState.error,
        hasSnapshot: runState.resource !== null
      }),
    [runState.error, runState.resource, runState.status]
  );

  return (
    <ControlPlanePage connection={connection}>
      <RunTurnsView
        error={runState.error}
        loading={runState.loading}
        resource={runState.resource}
      />
    </ControlPlanePage>
  );
}
