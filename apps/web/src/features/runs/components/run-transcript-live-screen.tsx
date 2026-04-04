"use client";

import React, { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import { useCodexRun } from "@/features/runs/hooks/use-codex-run";
import { RunTranscriptView } from "@/features/runs/components/run-transcript-view";

export function RunTranscriptLiveScreen(input: {
  model: SymphonyDashboardFoundationModel;
  runId: string;
}) {
  const runState = useCodexRun({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl,
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
    <ControlPlaneShell connection={connection} model={input.model}>
      <RunTranscriptView
        runtimeBaseUrl={input.model.runtimeBaseUrl}
        error={runState.error}
        loading={runState.loading}
        resource={runState.resource}
      />
    </ControlPlaneShell>
  );
}
