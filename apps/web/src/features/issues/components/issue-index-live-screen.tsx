"use client";

import { useMemo, useState } from "react";
import type { SymphonyForensicsIssuesQuery } from "@symphony/contracts";
import { IssueIndexView } from "@/features/issues/components/issue-index-view";
import { useIssueIndex } from "@/features/issues/hooks/use-issue-index";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function IssueIndexLiveScreen() {
  const model = useControlPlaneModel();
  const [query, setQuery] = useState<SymphonyForensicsIssuesQuery>({
    timeRange: "all",
    sortBy: "lastActive",
    sortDirection: "desc"
  });
  const issueIndexState = useIssueIndex({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    query
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
    <ControlPlanePage connection={connection}>
      <IssueIndexView
        connection={connection}
        error={issueIndexState.error}
        issueIndex={issueIndexState.resource}
        loading={issueIndexState.loading}
        query={query}
        runtimeBaseUrl={model.runtimeBaseUrl}
        onQueryChange={setQuery}
      />
    </ControlPlanePage>
  );
}
