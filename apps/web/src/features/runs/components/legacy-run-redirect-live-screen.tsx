"use client";

import React, { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { buildIssueRunHref } from "@/core/control-plane-routes";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import { useAgentRun } from "@/features/runs/hooks/use-agent-run";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";

export function LegacyRunRedirectLiveScreen(input: { runId: string }) {
  const router = useRouter();
  const model = useControlPlaneModel();
  const runState = useAgentRun({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    runId: input.runId
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: runState.status,
        error: runState.error,
        hasSnapshot: runState.resource !== null
      }),
    [runState.error, runState.resource, runState.status]
  );
  const nestedHref = runState.resource
    ? buildIssueRunHref(
        runState.resource.runDetail.issue.issueIdentifier,
        runState.resource.runDetail.run.runId
      )
    : null;

  useEffect(() => {
    if (!nestedHref) {
      return;
    }

    router.replace(nestedHref);
  }, [nestedHref, router]);

  return (
    <ControlPlanePage connection={connection}>
      <Card>
        <CardHeader>
          <CardTitle>Redirecting run route</CardTitle>
          <CardDescription>
            Runs now live under their parent issue so issue, run, and turn pages stay nested in the same drilldown.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {nestedHref ? (
            <Link
              href={nestedHref}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Open the issue-scoped run page
            </Link>
          ) : (
            "Loading the issue-scoped run page…"
          )}
        </CardContent>
      </Card>
    </ControlPlanePage>
  );
}
