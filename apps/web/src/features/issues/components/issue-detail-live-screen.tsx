"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import { IssueRequeuePanel } from "@/components/issue-requeue-panel";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { buildRuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import { useRuntimeIssue } from "@/hooks/use-runtime-issue";
import { IssueDetailView } from "@/features/issues/components/issue-detail-view";
import { useIssueDetail } from "@/features/issues/hooks/use-issue-detail";

export function IssueDetailLiveScreen(input: {
  issueIdentifier: string;
  model: SymphonyDashboardFoundationModel;
}) {
  const issueDetailState = useIssueDetail({
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
          issueIdentifier={input.issueIdentifier}
          loading={issueDetailState.loading}
        />
      </div>
    </ControlPlaneShell>
  );
}
