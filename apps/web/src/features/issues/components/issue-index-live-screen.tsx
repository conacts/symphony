"use client";

import { useMemo, useState } from "react";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import type { SymphonyForensicsIssuesQuery } from "@symphony/contracts";
import { IssueIndexView } from "@/features/issues/components/issue-index-view";
import { useIssueIndex } from "@/features/issues/hooks/use-issue-index";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function IssueIndexLiveScreen(input: {
  model: SymphonyDashboardFoundationModel;
}) {
  const [query, setQuery] = useState<SymphonyForensicsIssuesQuery>({
    timeRange: "all",
    sortBy: "lastActive",
    sortDirection: "desc"
  });
  const issueIndexState = useIssueIndex({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    websocketUrl: input.model.websocketUrl,
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
    <ControlPlaneShell connection={connection} model={input.model}>
      <IssueIndexView
        connection={connection}
        error={issueIndexState.error}
        issueIndex={issueIndexState.resource}
        loading={issueIndexState.loading}
        query={query}
        runtimeBaseUrl={input.model.runtimeBaseUrl}
        onQueryChange={setQuery}
      />
    </ControlPlaneShell>
  );
}
