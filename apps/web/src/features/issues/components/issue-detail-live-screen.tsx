"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { readRepoScopeFromSearchParams } from "@/core/control-plane-repo-scope";
import { buildIssueBreadcrumbRoutes } from "@/core/control-plane-routes";
import { useRuntimeIssue } from "@/hooks/use-runtime-issue";
import { IssueDetailView } from "@/features/issues/components/issue-detail-view";
import { IssueRequeuePanel } from "@/features/issues/components/issue-requeue-panel";
import { useIssueDetail } from "@/features/issues/hooks/use-issue-detail";
import { useIssueWorkflowObservability } from "@/features/issues/hooks/use-issue-workflow-observability";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function IssueDetailLiveScreen(input: { issueIdentifier: string }) {
  const model = useControlPlaneModel();
  const searchParams = useSearchParams();
  const repo = readRepoScopeFromSearchParams(searchParams);
  const issueDetailState = useIssueDetail({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    issueIdentifier: input.issueIdentifier,
    repo
  });
  const runtimeIssueState = useRuntimeIssue({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    issueIdentifier: input.issueIdentifier
  });
  const workflowObservabilityState = useIssueWorkflowObservability({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    issueIdentifier: input.issueIdentifier
  });
  const connectionStatus =
    issueDetailState.status === "connected" ||
    runtimeIssueState.status === "connected" ||
    workflowObservabilityState.status === "connected"
      ? "connected"
      : issueDetailState.status === "degraded" &&
          runtimeIssueState.status === "degraded" &&
          workflowObservabilityState.status === "degraded"
        ? "degraded"
        : "connecting";
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: connectionStatus,
        error:
          workflowObservabilityState.error ??
          issueDetailState.error ??
          runtimeIssueState.error,
        hasSnapshot:
          issueDetailState.resource !== null ||
          runtimeIssueState.resource !== null ||
          workflowObservabilityState.resource !== null
      }),
    [
      connectionStatus,
      issueDetailState.error,
      issueDetailState.resource,
      runtimeIssueState.error,
      runtimeIssueState.resource,
      workflowObservabilityState.error,
      workflowObservabilityState.resource
    ]
  );
  const handleCapabilityUpdated = async () => {
    await Promise.all([
      runtimeIssueState.refresh(),
      issueDetailState.refresh(),
      workflowObservabilityState.refresh()
    ]);
  };

  return (
    <ControlPlanePage
      connection={connection}
      breadcrumbs={buildIssueBreadcrumbRoutes(input.issueIdentifier, { repo })}
    >
      <div className="flex flex-col gap-8">
        <IssueRequeuePanel
          error={runtimeIssueState.error}
          issue={runtimeIssueState.resource}
          issueDetail={issueDetailState.resource}
          issueIdentifier={input.issueIdentifier}
          loading={runtimeIssueState.loading}
          runtimeBaseUrl={model.runtimeBaseUrl}
          onCapabilityUpdated={handleCapabilityUpdated}
        />
        <IssueDetailView
          connection={connection}
          issueDetailError={issueDetailState.error}
          issueDetail={issueDetailState.resource}
          issueDetailLoading={issueDetailState.loading}
          runtimeIssue={runtimeIssueState.resource}
          workflowObservability={workflowObservabilityState.resource}
          workflowObservabilityError={workflowObservabilityState.error}
          workflowObservabilityLoading={workflowObservabilityState.loading}
        />
      </div>
    </ControlPlanePage>
  );
}
