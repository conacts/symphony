"use client";

import React from "react";
import type {
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeWorkflowObservabilityResult
} from "@symphony/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCount,
  formatLabel,
  formatStatusLabel,
  formatTimestamp
} from "@/core/display-formatters";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import type { SymphonyForensicsIssueDetailResult } from "@symphony/contracts";
import { IssueRunMachineLoadChart } from "@/features/issues/components/issue-run-machine-load-chart";
import { IssueRunHistoryCard } from "@/features/issues/components/issue-run-history-card";
import { IssueRunTokenChart } from "@/features/issues/components/issue-run-token-chart";
import { IssueWorkflowObservabilityView } from "@/features/issues/components/issue-workflow-observability-view";
import { buildIssueDetailViewModel } from "@/features/issues/model/issue-view-model";

export function IssueDetailView(input: {
  connection: RuntimeSummaryConnectionState;
  issueDetailError: string | null;
  issueDetail: SymphonyForensicsIssueDetailResult | null;
  issueDetailLoading: boolean;
  runtimeIssue: SymphonyRuntimeIssueResult | null;
  workflowObservability: SymphonyRuntimeWorkflowObservabilityResult | null;
  workflowObservabilityError: string | null;
  workflowObservabilityLoading: boolean;
}) {
  const viewModel = input.issueDetail
    ? buildIssueDetailViewModel(input.issueDetail)
    : null;
  const shouldShowSkeleton =
    viewModel === null &&
    input.workflowObservability === null &&
    input.runtimeIssue === null &&
    (input.issueDetailLoading || input.workflowObservabilityLoading);

  return (
    <div className="flex flex-col gap-8">
      {input.workflowObservabilityError ? (
        <Alert variant="destructive">
          <AlertTitle>Workflow observability degraded</AlertTitle>
          <AlertDescription>{input.workflowObservabilityError}</AlertDescription>
        </Alert>
      ) : null}

      {input.issueDetailError ? (
        <Alert variant="destructive">
          <AlertTitle>Run forensics degraded</AlertTitle>
          <AlertDescription>{input.issueDetailError}</AlertDescription>
        </Alert>
      ) : null}

      {input.workflowObservability ? (
        <IssueWorkflowObservabilityView
          runtimeIssue={input.runtimeIssue}
          workflow={input.workflowObservability}
        />
      ) : null}

      {viewModel ? (
        <>
          <section className="grid gap-6 xl:grid-cols-2">
            <IssueRunTokenChart rows={viewModel.tokenChartRows} />
            <IssueRunMachineLoadChart rows={viewModel.machineLoadChartRows} />
          </section>

          <IssueRunHistoryCard rows={viewModel.rows} />
        </>
      ) : shouldShowSkeleton ? (
        <div className="flex flex-col gap-6">
          <section className="grid gap-6 xl:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <Card key={index}>
                <CardHeader className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-72 w-full" />
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      ) : input.runtimeIssue ? (
        <IssueRuntimeFallbackView issue={input.runtimeIssue} />
      ) : (
        input.workflowObservability ? null : (
          <Card>
            <CardHeader>
              <CardTitle>Issue detail unavailable</CardTitle>
              <CardDescription>
                No run forensics have been recorded for this issue yet.
              </CardDescription>
            </CardHeader>
          </Card>
        )
      )}
    </div>
  );
}

function IssueRuntimeFallbackView(input: {
  issue: SymphonyRuntimeIssueResult;
}) {
  const capability = input.issue.operator.capability;
  const executionSummary = buildRuntimeExecutionSummary(input.issue);
  const workspace = input.issue.workspace;
  const envBundleSummary = workspace.envBundleSummary
    ? `${formatLabel(workspace.envBundleSummary.source)} · ${formatCount(
        workspace.envBundleSummary.injectedKeys.length
      )} injected keys`
    : "No environment bundle captured";
  const servicesSummary =
    workspace.services.length > 0
      ? `${formatCount(workspace.services.length)} attached service${workspace.services.length === 1 ? "" : "s"}`
      : "No attached services";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Live runtime snapshot</CardTitle>
          <CardDescription>
            Run forensics have not been recorded for this issue yet. This view is
            rendering the runtime-tracker snapshot instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
          <DetailField
            label="Runtime status"
            value={formatStatusLabel(input.issue.status)}
          />
          <DetailField
            label="Tracker state"
            value={formatStatusLabel(input.issue.tracked.state)}
          />
          <DetailField
            label="Project"
            value={input.issue.tracked.projectName ?? "n/a"}
          />
          <DetailField
            label="Team"
            value={input.issue.tracked.teamKey ?? "n/a"}
          />
          <DetailField
            label="Branch"
            value={input.issue.tracked.branchName ?? "n/a"}
          />
          <DetailField
            label="Selected model"
            value={
              input.issue.operator.pi.selectedModel ??
              input.issue.operator.pi.defaultModel ??
              "n/a"
            }
          />
          <DetailField
            label="Attempts"
            value={buildAttemptsSummary(input.issue)}
          />
          <DetailField
            label="Router plan"
            value={capability ? formatStatusLabel(capability.planKind) : "n/a"}
          />
          <DetailField
            label="Execution"
            value={executionSummary.value}
            detail={executionSummary.detail}
            className="md:col-span-2"
          />
          <DetailField
            label="Router summary"
            value={capability?.summary ?? "No capability routing snapshot available."}
            className="md:col-span-2 xl:col-span-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace context</CardTitle>
          <CardDescription>
            Prepared workspace information currently attached to this issue in the
            runtime snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
          <DetailField
            label="Backend"
            value={formatLabel(workspace.backendKind)}
          />
          <DetailField
            label="Prepare disposition"
            value={formatLabel(workspace.prepareDisposition)}
          />
          <DetailField
            label="Execution target"
            value={formatLabel(workspace.executionTargetKind)}
          />
          <DetailField
            label="Materialization"
            value={formatLabel(workspace.materializationKind)}
          />
          <DetailField label="Host path" value={workspace.hostPath ?? "n/a"} />
          <DetailField
            label="Runtime path"
            value={workspace.runtimePath ?? workspace.path ?? "n/a"}
          />
          <DetailField
            label="Container"
            value={workspace.containerName ?? workspace.containerId ?? "n/a"}
          />
          <DetailField label="Services" value={servicesSummary} />
          <DetailField
            label="Environment"
            value={envBundleSummary}
            className="md:col-span-2"
          />
          <DetailField
            label="Last error"
            value={input.issue.lastError ?? "No active runtime error"}
            className="md:col-span-2"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function DetailField(input: {
  label: string;
  value: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={input.className}>
      <p className="font-medium text-foreground">{input.label}</p>
      <p>{input.value}</p>
      {input.detail ? <p className="text-xs">{input.detail}</p> : null}
    </div>
  );
}

function buildAttemptsSummary(issue: SymphonyRuntimeIssueResult): string {
  if (issue.retry) {
    return `Retry ${formatCount(issue.retry.attempt)} scheduled`;
  }

  if (issue.attempts.restartCount > 0) {
    return `${formatCount(issue.attempts.restartCount)} restart${issue.attempts.restartCount === 1 ? "" : "s"}`;
  }

  return "No retries recorded";
}

function buildRuntimeExecutionSummary(issue: SymphonyRuntimeIssueResult): {
  value: string;
  detail: string;
} {
  if (issue.running) {
    return {
      value: `Active since ${formatTimestamp(issue.running.startedAt)}`,
      detail:
        `Thread ${issue.running.threadId ?? "n/a"} · ` +
        `${formatCount(issue.running.turnCount)} turns · ` +
        `${formatCount(issue.running.tokens.totalTokens)} tokens · ` +
        `${issue.running.lastMessage ?? issue.running.lastEvent ?? "No recent agent update"}`
    };
  }

  if (issue.retry) {
    return {
      value: `Retry due ${formatTimestamp(issue.retry.dueAt)}`,
      detail: issue.retry.error ?? "Waiting for the next retry window."
    };
  }

  return {
    value: "No active agent run is currently attached to this issue.",
    detail:
      "The issue is present in tracker and router state, but no runtime execution is active yet."
  };
}
