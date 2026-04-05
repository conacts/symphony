"use client";

import React, { useMemo } from "react";
import {
  buildIssueRunBreadcrumbRoutes
} from "@/core/control-plane-routes";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import { useAgentRun } from "@/features/runs/hooks/use-agent-run";
import { RunTranscriptView } from "@/features/runs/components/run-transcript-view";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";

export function RunTranscriptLiveScreen(input: { runId: string }) {
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
    <ControlPlanePage
      connection={connection}
      breadcrumbs={
        runState.resource
          ? buildIssueRunBreadcrumbRoutes(
              runState.resource.runDetail.issue.issueIdentifier,
              runState.resource.runDetail.run.runId
            )
          : []
      }
    >
      <RunTranscriptView
        error={runState.error}
        loading={runState.loading}
        resource={runState.resource}
      />
    </ControlPlanePage>
  );
}
