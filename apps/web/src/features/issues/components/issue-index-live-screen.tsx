"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SymphonyForensicsIssuesQuery } from "@symphony/contracts";
import { IssueIndexView } from "@/features/issues/components/issue-index-view";
import { useIssueIndex } from "@/features/issues/hooks/use-issue-index";
import {
  buildIssueQueryFromSearchParams,
  buildIssueSearchParams
} from "@/features/issues/model/issue-query-state";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function IssueIndexLiveScreen() {
  const model = useControlPlaneModel();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(
    () => buildIssueQueryFromSearchParams(searchParams),
    [searchParams]
  );
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

  function updateQuery(nextQuery: SymphonyForensicsIssuesQuery) {
    const nextSearchParams = buildIssueSearchParams(nextQuery);
    const nextQueryString = nextSearchParams.toString();

    router.replace(
      nextQueryString.length > 0 ? `${pathname}?${nextQueryString}` : pathname,
      { scroll: false }
    );
  }

  return (
    <ControlPlanePage connection={connection}>
      <IssueIndexView
        connection={connection}
        error={issueIndexState.error}
        issueIndex={issueIndexState.resource}
        loading={issueIndexState.loading}
        query={query}
        onQueryChange={updateQuery}
      />
    </ControlPlanePage>
  );
}
