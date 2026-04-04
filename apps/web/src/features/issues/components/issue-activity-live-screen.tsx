"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { useIssueForensicsBundle } from "@/hooks/use-issue-forensics-bundle";
import { IssueActivityView } from "@/features/issues/components/issue-activity-view";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function IssueActivityLiveScreen(input: {
  issueIdentifier: string;
  model: SymphonyDashboardFoundationModel;
}) {
  const issueActivityState = useIssueForensicsBundle({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl,
    issueIdentifier: input.issueIdentifier
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: issueActivityState.status,
        error: issueActivityState.error,
        hasSnapshot: issueActivityState.resource !== null
      }),
    [issueActivityState.error, issueActivityState.resource, issueActivityState.status]
  );

  return (
    <ControlPlaneShell connection={connection} model={input.model}>
      <IssueActivityView
        connection={connection}
        error={issueActivityState.error}
        issueActivity={issueActivityState.resource}
        issueIdentifier={input.issueIdentifier}
        loading={issueActivityState.loading}
      />
    </ControlPlaneShell>
  );
}
