"use client";

import { useMemo } from "react";
import { useIssueForensicsBundle } from "@/hooks/use-issue-forensics-bundle";
import { IssueActivityView } from "@/features/issues/components/issue-activity-view";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function IssueActivityLiveScreen(input: { issueIdentifier: string }) {
  const model = useControlPlaneModel();
  const issueActivityState = useIssueForensicsBundle({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
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
    <ControlPlanePage connection={connection}>
      <IssueActivityView
        connection={connection}
        error={issueActivityState.error}
        issueActivity={issueActivityState.resource}
        issueIdentifier={input.issueIdentifier}
        loading={issueActivityState.loading}
      />
    </ControlPlanePage>
  );
}
