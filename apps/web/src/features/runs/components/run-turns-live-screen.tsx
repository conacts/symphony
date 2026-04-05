"use client";

import React, { useMemo } from "react";
import {
  buildIssueHref,
  buildIssueRunHref,
  buildIssueRunTurnsHref,
  buildIssuesHref
} from "@/core/control-plane-routes";
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
    <ControlPlanePage
      connection={connection}
      breadcrumbs={
        runState.resource
          ? [
              { label: "Issues", href: buildIssuesHref() },
              {
                label: runState.resource.runDetail.issue.issueIdentifier,
                href: buildIssueHref(runState.resource.runDetail.issue.issueIdentifier)
              },
              {
                label: runState.resource.runDetail.run.runId,
                href: buildIssueRunHref(
                  runState.resource.runDetail.issue.issueIdentifier,
                  runState.resource.runDetail.run.runId
                )
              },
              {
                label: "Turns",
                href: buildIssueRunTurnsHref(
                  runState.resource.runDetail.issue.issueIdentifier,
                  runState.resource.runDetail.run.runId
                )
              }
            ]
          : []
      }
    >
      <RunTurnsView
        error={runState.error}
        loading={runState.loading}
        resource={runState.resource}
      />
    </ControlPlanePage>
  );
}
