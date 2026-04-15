"use client";

import React from "react";
import { ArrowUpRightIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  SymphonyRuntimeLogsResult,
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
import { buildIssueTimelineHref } from "@/core/control-plane-routes";
import {
  formatCount,
  formatEventTypeLabel,
  formatLabel,
  formatSourceLabel,
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
  issueIdentifier: string;
  issueDetailError: string | null;
  issueDetail: SymphonyForensicsIssueDetailResult | null;
  issueDetailLoading: boolean;
  runtimeIssue: SymphonyRuntimeIssueResult | null;
  runtimeLogs: SymphonyRuntimeLogsResult | null;
  runtimeLogsError: string | null;
  runtimeLogsLoading: boolean;
  workflowObservability: SymphonyRuntimeWorkflowObservabilityResult | null;
  workflowObservabilityError: string | null;
  workflowObservabilityLoading: boolean;
}) {
  const viewModel = input.issueDetail
    ? buildIssueDetailViewModel(input.issueDetail)
    : null;
  const runtimeLifecycleRepositoryKey =
    input.workflowObservability?.workflow.repositoryKey ??
    input.issueDetail?.repositoryKey ??
    null;
  const shouldShowSkeleton =
    viewModel === null &&
    input.workflowObservability === null &&
    input.runtimeIssue === null &&
    input.runtimeLogs === null &&
    (input.issueDetailLoading || input.workflowObservabilityLoading);
  const shouldShowRuntimeLifecycle =
    input.runtimeLogs !== null ||
    input.runtimeLogsLoading ||
    input.runtimeIssue !== null ||
    input.workflowObservability !== null;

  return (
    <div className="flex flex-col gap-8">
      {input.workflowObservabilityError ? (
        <Alert variant="destructive">
          <AlertTitle>Workflow observability degraded</AlertTitle>
          <AlertDescription>{input.workflowObservabilityError}</AlertDescription>
        </Alert>
      ) : null}

      {input.runtimeLogsError ? (
        <Alert variant="destructive">
          <AlertTitle>Runtime lifecycle degraded</AlertTitle>
          <AlertDescription>{input.runtimeLogsError}</AlertDescription>
        </Alert>
      ) : null}

      {input.issueDetailError ? (
        <Alert variant="destructive">
          <AlertTitle>Run forensics degraded</AlertTitle>
          <AlertDescription>{input.issueDetailError}</AlertDescription>
        </Alert>
      ) : null}

      {shouldShowRuntimeLifecycle ? (
        <IssueRuntimeLifecycleCard
          issueIdentifier={input.issueIdentifier}
          repositoryKey={runtimeLifecycleRepositoryKey}
          runtimeIssue={input.runtimeIssue}
          runtimeLogs={input.runtimeLogs}
          runtimeLogsLoading={input.runtimeLogsLoading}
          workflowObservability={input.workflowObservability}
        />
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

function IssueRuntimeLifecycleCard(input: {
  issueIdentifier: string;
  repositoryKey: string | null;
  runtimeIssue: SymphonyRuntimeIssueResult | null;
  runtimeLogs: SymphonyRuntimeLogsResult | null;
  runtimeLogsLoading: boolean;
  workflowObservability: SymphonyRuntimeWorkflowObservabilityResult | null;
}) {
  const timelineHref = buildIssueTimelineHref(
    input.issueIdentifier,
    input.repositoryKey ? { repo: input.repositoryKey } : undefined
  );
  const lifecycle = buildIssueRuntimeLifecycleSummary({
    runtimeIssue: input.runtimeIssue,
    runtimeLogs: input.runtimeLogs,
    workflowObservability: input.workflowObservability
  });

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Runtime lifecycle</CardTitle>
            <CardDescription>
              High-signal issue-scoped runtime events, plus the current router and
              execution status.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={timelineHref}>
              Full timeline
              <ArrowUpRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <LifecycleSummaryBlock
            label="Current step"
            value={lifecycle.currentStep.value}
            detail={lifecycle.currentStep.detail}
          />
          <LifecycleSummaryBlock
            label="Waiting on"
            value={lifecycle.waitingOn.value}
            detail={lifecycle.waitingOn.detail}
          />
          <LifecycleSummaryBlock
            label="Router"
            value={lifecycle.router.value}
            detail={lifecycle.router.detail}
          />
          <LifecycleSummaryBlock
            label="Latest runtime event"
            value={lifecycle.latestEvent.value}
            detail={lifecycle.latestEvent.detail}
          />
        </div>
      </CardHeader>
      <CardContent>
        {input.runtimeLogsLoading && lifecycle.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Loading issue-scoped runtime events.
          </p>
        ) : lifecycle.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No issue-scoped runtime events have been captured yet.
          </p>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={lifecycle.logs.slice(0, 2).map((entry) => entry.entryId)}
            className="space-y-3"
          >
            {lifecycle.logs.map((entry) => (
              <AccordionItem
                key={entry.entryId}
                value={entry.entryId}
                className="rounded-xl border border-border/70 px-4"
              >
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex min-w-0 flex-1 flex-col gap-3 pr-4 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={runtimeLogBadgeVariant(entry.level)}>
                        {entry.level}
                      </Badge>
                      <Badge variant="secondary">
                        {formatSourceLabel(entry.source)}
                      </Badge>
                      <Badge variant="outline">
                        {formatEventTypeLabel(entry.eventType)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(entry.recordedAt)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {entry.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {buildRuntimeLogScopeLabel(entry)}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <pre className="overflow-x-auto rounded-xl border border-border/70 bg-muted/20 p-3 text-xs leading-5 text-foreground whitespace-pre-wrap break-words">
                    {formatRuntimeLogPayload(entry.payload)}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
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

function LifecycleSummaryBlock(input: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {input.label}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">{input.value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{input.detail}</p>
    </div>
  );
}

function buildIssueRuntimeLifecycleSummary(input: {
  runtimeIssue: SymphonyRuntimeIssueResult | null;
  runtimeLogs: SymphonyRuntimeLogsResult | null;
  workflowObservability: SymphonyRuntimeWorkflowObservabilityResult | null;
}) {
  const logs = [...(input.runtimeLogs?.logs ?? [])]
    .sort(
      (left, right) =>
        Date.parse(right.recordedAt) - Date.parse(left.recordedAt)
    )
    .slice(0, 8);
  const latestLog = logs[0] ?? null;
  const currentModule = input.workflowObservability?.currentModule ?? null;
  const routerDecision = input.workflowObservability?.routerDecision ?? null;
  const capability =
    input.workflowObservability?.capability ??
    input.runtimeIssue?.operator.capability ??
    null;
  const currentStepValue = currentModule
    ? currentModule.module.summary
    : capability
      ? formatStatusLabel(capability.planKind)
      : input.runtimeIssue?.running
        ? "Runtime execution active"
        : "No active execution";
  const currentStepDetail = currentModule
    ? `${formatStatusLabel(currentModule.state)} · ${currentModule.summary}`
    : capability
      ? capability.summary
      : input.runtimeIssue?.running?.lastMessage ??
        "No module selection or live runtime state is currently attached to this issue.";
  const waitingOn = resolveIssueLifecycleWaitingState({
    capability,
    currentModule,
    runtimeIssue: input.runtimeIssue,
    workflowObservability: input.workflowObservability
  });
  const routerValue = routerDecision
    ? formatStatusLabel(routerDecision.selectionMode)
    : currentModule?.decision?.selectionMode
      ? formatStatusLabel(currentModule.decision.selectionMode)
      : "No router decision";
  const routerDetail = routerDecision
    ? routerDecision.selectionSummary
    : currentModule?.decision?.selectionSummary ??
      "The router has not recorded a module-selection rationale yet.";
  const latestEventValue = latestLog
    ? formatEventTypeLabel(latestLog.eventType)
    : "No runtime events";
  const latestEventDetail = latestLog
    ? `${formatSourceLabel(latestLog.source)} · ${latestLog.message}`
    : "No issue-scoped runtime events have been captured yet.";

  return {
    currentStep: {
      value: currentStepValue,
      detail: currentStepDetail
    },
    waitingOn,
    router: {
      value: routerValue,
      detail: routerDetail
    },
    latestEvent: {
      value: latestEventValue,
      detail: latestEventDetail
    },
    logs
  };
}

function resolveIssueLifecycleWaitingState(input: {
  capability:
    | SymphonyRuntimeWorkflowObservabilityResult["capability"]
    | SymphonyRuntimeIssueResult["operator"]["capability"]
    | null;
  currentModule: SymphonyRuntimeWorkflowObservabilityResult["currentModule"];
  runtimeIssue: SymphonyRuntimeIssueResult | null;
  workflowObservability: SymphonyRuntimeWorkflowObservabilityResult | null;
}) {
  if (input.capability?.planKind === "awaiting_input") {
    return {
      value: "Clarification",
      detail:
        input.capability.pendingClarification?.summary ??
        "Waiting for an operator clarification answer."
    };
  }

  if (input.capability?.planKind === "blocked") {
    return {
      value: "Operator intervention",
      detail: input.capability.summary
    };
  }

  if (input.capability?.planKind === "ready_for_completion") {
    return {
      value: "Manual completion",
      detail:
        input.capability.summary ??
        "Waiting for operator review and final completion handling."
    };
  }

  if (input.currentModule?.state === "selected") {
    return {
      value: "Module start",
      detail: "Waiting for the selected module run to begin."
    };
  }

  if (input.currentModule?.state === "started") {
    return {
      value: "Agent activity",
      detail:
        input.runtimeIssue?.running?.lastMessage ??
        "Waiting for the active module to produce more runtime activity."
    };
  }

  if (input.currentModule?.state === "clarification_requested") {
    return {
      value: "Clarification",
      detail: input.currentModule.summary
    };
  }

  if (input.currentModule?.state === "blocked") {
    return {
      value: "Blocked",
      detail: input.currentModule.summary
    };
  }

  if (input.workflowObservability?.snapshot?.terminal) {
    return {
      value: "Terminal",
      detail: "The workflow snapshot is terminal and is not waiting on more router work."
    };
  }

  return {
    value: "Router progression",
    detail: "Waiting for the next router transition or runtime event."
  };
}

function runtimeLogBadgeVariant(
  level: SymphonyRuntimeLogsResult["logs"][number]["level"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (level) {
    case "error":
      return "destructive";
    case "warn":
      return "secondary";
    default:
      return "outline";
  }
}

function buildRuntimeLogScopeLabel(
  entry: SymphonyRuntimeLogsResult["logs"][number]
): string {
  if (entry.issueIdentifier && entry.runId) {
    return `${entry.issueIdentifier} · Run ${entry.runId}`;
  }

  if (entry.issueIdentifier) {
    return entry.issueIdentifier;
  }

  if (entry.runId) {
    return `Run ${entry.runId}`;
  }

  return "Issue-scoped lifecycle event";
}

function formatRuntimeLogPayload(
  payload: SymphonyRuntimeLogsResult["logs"][number]["payload"]
): string {
  if (payload === null) {
    return "No structured payload.";
  }

  if (typeof payload === "string") {
    return payload;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
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
