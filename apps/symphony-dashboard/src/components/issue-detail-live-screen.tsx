"use client";

import { useMemo } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import { IssueDetailView } from "@/components/issue-detail-view";
import { IssueRequeuePanel } from "@/components/issue-requeue-panel";
import { RuntimeRefreshPanel } from "@/components/runtime-refresh-panel";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { buildRuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import { useIssueDetail } from "@/hooks/use-issue-detail";
import { useRuntimeIssue } from "@/hooks/use-runtime-issue";
import { useRuntimeRefreshAction } from "@/hooks/use-runtime-refresh-action";

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
  const refreshAction = useRuntimeRefreshAction({
    refreshUrl: input.model.runtimeSurface.refreshUrl,
    onRequested: async () => {
      await Promise.all([
        issueDetailState.refresh(),
        runtimeIssueState.refresh()
      ]);
    }
  });

  return (
    <ControlPlaneShell connection={connection} model={input.model}>
      <RuntimeRefreshPanel
        error={refreshAction.error}
        lastResult={refreshAction.lastResult}
        onRefresh={() => void refreshAction.triggerRefresh()}
        pending={refreshAction.pending}
      />
      <IssueRequeuePanel
        error={runtimeIssueState.error}
        issue={runtimeIssueState.resource}
        loading={runtimeIssueState.loading}
      />
      <IssueDetailView
        connection={connection}
        error={issueDetailState.error}
        issueDetail={issueDetailState.resource}
        loading={issueDetailState.loading}
      />
    </ControlPlaneShell>
  );
}
