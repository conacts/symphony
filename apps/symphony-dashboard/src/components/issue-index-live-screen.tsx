"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import { IssueIndexView } from "@/components/issue-index-view";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { buildRuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import { useIssueIndex } from "@/hooks/use-issue-index";

export function IssueIndexLiveScreen(input: {
  model: SymphonyDashboardFoundationModel;
}) {
  const issueIndexState = useIssueIndex({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: issueIndexState.status,
        error: issueIndexState.error,
        hasSnapshot: issueIndexState.resource !== null
      }),
    [issueIndexState.error, issueIndexState.resource, issueIndexState.status]
  );

  return (
    <ControlPlaneShell connection={connection} model={input.model}>
      <IssueIndexView
        connection={connection}
        error={issueIndexState.error}
        issueIndex={issueIndexState.resource}
        loading={issueIndexState.loading}
      />
    </ControlPlaneShell>
  );
}
