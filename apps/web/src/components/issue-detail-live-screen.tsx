"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import { IssueDetailView } from "@/components/issue-detail-view";
import { IssueRequeuePanel } from "@/components/issue-requeue-panel";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { buildRuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import { useIssueForensicsBundle } from "@/hooks/use-issue-forensics-bundle";
import { useRuntimeIssue } from "@/hooks/use-runtime-issue";

export function IssueDetailLiveScreen(input: {
  issueIdentifier: string;
  model: SymphonyDashboardFoundationModel;
}) {
  const issueDetailState = useIssueForensicsBundle({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl,
    issueIdentifier: input.issueIdentifier
  });
  const runtimeIssueState = useRuntimeIssue({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl,
    issueIdentifier: input.issueIdentifier
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: issueDetailState.status,
        error: issueDetailState.error,
        hasSnapshot: issueDetailState.resource !== null
    }),
    [issueDetailState.error, issueDetailState.resource, issueDetailState.status]
  );

  return (
    <ControlPlaneShell connection={connection} model={input.model}>
      <div className="flex flex-col gap-8">
        <IssueRequeuePanel
          error={runtimeIssueState.error}
          issue={runtimeIssueState.resource}
          issueIdentifier={input.issueIdentifier}
          loading={runtimeIssueState.loading}
        />
        <IssueDetailView
          connection={connection}
          error={issueDetailState.error}
          issueDetail={issueDetailState.resource}
          loading={issueDetailState.loading}
        />
      </div>
    </ControlPlaneShell>
  );
}
