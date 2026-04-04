"use client";

import React, { useMemo } from "react";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import { useCodexRun } from "@/features/runs/hooks/use-codex-run";
import { RunTranscriptView } from "@/features/runs/components/run-transcript-view";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";

export function RunTranscriptLiveScreen(input: { runId: string }) {
  const model = useControlPlaneModel();
  const runState = useCodexRun({
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
      <RunTranscriptView
        runtimeBaseUrl={model.runtimeBaseUrl}
        error={runState.error}
        loading={runState.loading}
        resource={runState.resource}
      />
    </ControlPlanePage>
  );
}
