"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import { ProblemRunsView } from "@/components/problem-runs-view";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { buildRuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import { useProblemRuns } from "@/hooks/use-problem-runs";

export function ProblemRunsLiveScreen(input: {
  model: SymphonyDashboardFoundationModel;
}) {
  const problemRunsState = useProblemRuns({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl
  });

  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: problemRunsState.status,
        error: problemRunsState.error,
        hasSnapshot: problemRunsState.resource !== null
      }),
    [problemRunsState.error, problemRunsState.resource, problemRunsState.status]
  );

  return (
    <ControlPlaneShell connection={connection} model={input.model}>
      <ProblemRunsView
        connection={connection}
        error={problemRunsState.error}
        loading={problemRunsState.loading}
        problemRuns={problemRunsState.resource}
      />
    </ControlPlaneShell>
  );
}
