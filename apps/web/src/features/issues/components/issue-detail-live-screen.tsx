"use client";

import { useMemo } from "react";
import { useRuntimeIssue } from "@/hooks/use-runtime-issue";
import { IssueDetailView } from "@/features/issues/components/issue-detail-view";
import { IssueRequeuePanel } from "@/features/issues/components/issue-requeue-panel";
import { useIssueDetail } from "@/features/issues/hooks/use-issue-detail";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function IssueDetailLiveScreen(input: { issueIdentifier: string }) {
  const model = useControlPlaneModel();
  const issueDetailState = useIssueDetail({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    issueIdentifier: input.issueIdentifier
  });
  const runtimeIssueState = useRuntimeIssue({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
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
    <ControlPlanePage connection={connection}>
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
    </ControlPlanePage>
  );
}
