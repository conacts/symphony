import React from "react";
import { ArrowRightIcon, RouteIcon, WorkflowIcon } from "lucide-react";
import type {
  JsonValue,
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeWorkflowObservabilityResult
} from "@symphony/contracts";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  formatCount,
  formatEventTypeLabel,
  formatLabel,
  formatSourceLabel,
  formatStatusLabel,
  formatTimestamp,
  prettyValue
} from "@/core/display-formatters";
import { cn } from "@/lib/utils";

export function IssueWorkflowObservabilityView(input: {
  runtimeIssue: SymphonyRuntimeIssueResult | null;
  workflow: SymphonyRuntimeWorkflowObservabilityResult;
}) {
  const signalsById = new Map(
    input.workflow.replay.signals.map((signal) => [signal.id, signal] as const)
  );
  const decisions = [...input.workflow.decisions].sort((left, right) =>
    right.eventSequence - left.eventSequence
  );
  const history = [...input.workflow.history].sort((left, right) =>
    right.eventSequence - left.eventSequence
  );
  const stepRuns = buildNodeRuns(input.workflow, signalsById);
  const currentStep = stepRuns.find((step) => step.status !== "completed") ?? null;
  const latestSignal = input.workflow.replay.signals.at(-1) ?? null;
  const latestDecision = input.workflow.decisions.at(-1) ?? null;
  const selectedModel =
    input.runtimeIssue?.operator.pi.selectedModel ??
    input.runtimeIssue?.operator.pi.defaultModel ??
    null;
  const runtimeStatus = input.runtimeIssue?.status ?? null;
  const trackerState =
    input.workflow.trackerState ?? input.runtimeIssue?.tracked.state ?? null;
  const summaryCards = [
    {
      label: "Current step",
      value:
        input.workflow.snapshot?.currentNode !== null
          ? formatStatusLabel(input.workflow.snapshot?.currentNode)
          : "n/a",
      detail: currentStep
        ? `${currentStep.statusLabel} · ${currentStep.enteredAt}`
        : "No active workflow step is recorded."
    },
    {
      label: "Tracker state",
      value: trackerState ? formatStatusLabel(trackerState) : "n/a",
      detail: runtimeStatus ? `Runtime ${formatStatusLabel(runtimeStatus)}` : "No live runtime state attached."
    },
    {
      label: "Router plan",
      value: input.workflow.capability
        ? formatStatusLabel(input.workflow.capability.planKind)
        : "n/a",
      detail: input.workflow.capability?.summary ?? "No capability planner state is available."
    },
    {
      label: "Selected model",
      value: selectedModel ?? "n/a",
      detail:
        input.workflow.capability?.modelProfileId ??
        input.workflow.workflow.routerPresetId
    },
    {
      label: "Signals",
      value: formatCount(input.workflow.replay.recordedSignalCount),
      detail: latestSignal
        ? `${formatEventTypeLabel(latestSignal.type)} · ${formatTimestamp(latestSignal.occurredAt)}`
        : "No workflow signals recorded."
    },
    {
      label: "Decisions",
      value: formatCount(input.workflow.replay.recordedDecisionCount),
      detail: latestDecision
        ? `${formatStatusLabel(latestDecision.reasonCode)} · ${formatTimestamp(latestDecision.recordedAt)}`
        : "No router decisions recorded."
    },
    {
      label: "Pending commands",
      value: formatCount(input.workflow.snapshot?.pendingCommandCount ?? 0),
      detail: `${formatCount(input.workflow.replay.settledCommandCount)} settled commands`
    },
    {
      label: "Workflow",
      value: input.workflow.workflow.workflowId,
      detail: `${input.workflow.workflow.routerName} · v${input.workflow.workflow.routerVersion}`
    }
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{input.workflow.workflow.routerPresetId}</Badge>
            {trackerState ? (
              <Badge variant="outline">{formatStatusLabel(trackerState)}</Badge>
            ) : null}
            {runtimeStatus ? (
              <Badge variant="outline">{formatStatusLabel(runtimeStatus)}</Badge>
            ) : null}
            {selectedModel ? (
              <Badge variant="outline" className="font-mono">
                {selectedModel}
              </Badge>
            ) : null}
          </div>
          <div>
            <CardTitle>Workflow observability</CardTitle>
            <CardDescription>
              Router control-plane history, node transitions, and decision traces
              for this issue.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border/70 bg-muted/20 p-4"
            >
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {card.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground break-all">
                {card.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Route graph</CardTitle>
          <CardDescription>
            Each node visit is rendered as a step-run so the router reads like the
            old run and turn narrative.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stepRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No node transitions have been recorded for this workflow yet.
            </p>
          ) : (
            <ScrollArea className="w-full">
              <div className="flex min-w-max items-stretch gap-4 pb-2">
                {stepRuns.map((step, index) => (
                  <React.Fragment key={step.id}>
                    <div
                      className={cn(
                        "min-w-56 rounded-2xl border p-4",
                        step.status === "current"
                          ? "border-sky-300/70 bg-sky-50/70"
                          : step.status === "terminal"
                            ? "border-emerald-300/70 bg-emerald-50/70"
                            : "border-border/70 bg-muted/20"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          Step {String(step.sequence).padStart(2, "0")}
                        </p>
                        <Badge variant={badgeVariantForStepStatus(step.status)}>
                          {step.statusLabel}
                        </Badge>
                      </div>
                      <p className="mt-3 text-base font-semibold text-foreground">
                        {step.nodeLabel}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Entered {step.enteredAt}
                      </p>
                      <p className="mt-3 text-sm text-foreground">{step.summary}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {step.commandSummary}
                      </p>
                    </div>
                    {index < stepRuns.length - 1 ? (
                      <div className="flex min-w-24 flex-col items-center justify-center gap-2 text-center">
                        <ArrowRightIcon className="size-4 text-muted-foreground" />
                        <p className="text-[11px] text-muted-foreground">
                          {step.reasonLabel}
                        </p>
                      </div>
                    ) : null}
                  </React.Fragment>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Node run narrative</CardTitle>
            <CardDescription>
              Each router node visit is summarized like a run, including entry
              trigger, emitted commands, and trace evidence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stepRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Node run history will appear here once the workflow starts routing.
              </p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {[...stepRuns].reverse().map((step) => (
                  <Card key={step.id} className="border-border/70 shadow-none">
                    <CardHeader className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{step.nodeLabel}</CardTitle>
                          <CardDescription>{step.enteredAt}</CardDescription>
                        </div>
                        <Badge variant={badgeVariantForStepStatus(step.status)}>
                          {step.statusLabel}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{step.triggerLabel}</Badge>
                        <Badge variant="outline">{step.reasonLabel}</Badge>
                        {step.exitedAt ? (
                          <Badge variant="outline">Exited {step.exitedAt}</Badge>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <MetricMiniCard
                          icon={<WorkflowIcon className="size-3.5" />}
                          label="Transition"
                          value={step.transitionLabel}
                          detail={step.summary}
                        />
                        <MetricMiniCard
                          icon={<RouteIcon className="size-3.5" />}
                          label="Commands"
                          value={step.commandSummary}
                          detail={step.settlementSummary}
                        />
                      </div>

                      {step.commands.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            Commands
                          </p>
                          <div className="flex flex-col gap-2">
                            {step.commands.map((command) => (
                              <div
                                key={command.commandId}
                                className="rounded-xl border border-border/70 p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary">
                                    {command.statusLabel}
                                  </Badge>
                                  <Badge variant="outline" className="font-mono">
                                    {command.kindLabel}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {command.commandId}
                                  </span>
                                </div>
                                {command.detail ? (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {command.detail}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {step.traceEntries.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            Decision trace
                          </p>
                          <div className="space-y-2">
                            {step.traceEntries.map((entry) => (
                              <div
                                key={entry.key}
                                className="rounded-xl border border-border/70 bg-muted/20 p-3"
                              >
                                <p className="text-xs font-medium text-foreground">
                                  {entry.title}
                                </p>
                                {entry.detail ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {entry.detail}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signals</CardTitle>
            <CardDescription>
              External inputs and router-visible events that drove the workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {input.workflow.replay.signals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No workflow signals have been recorded yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {[...input.workflow.replay.signals]
                  .reverse()
                  .map((signal) => (
                    <div
                      key={signal.id}
                      className="rounded-xl border border-border/70 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {formatSourceLabel(signal.source)}
                        </Badge>
                        <Badge variant="outline">
                          {formatEventTypeLabel(signal.type)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(signal.occurredAt)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-medium text-foreground">
                        {signal.id}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {summarizeSignalPayload(signal.payload)}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Decision log</CardTitle>
            <CardDescription>
              Router decisions, why they matched, and which commands they emitted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Router decision logs have not been recorded yet.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {decisions.map((decision) => {
                  const signal = signalsById.get(decision.signalId) ?? null;
                  const projectionBefore = summarizeProjection(decision.projectionBefore);
                  const projectionAfter = summarizeProjection(decision.projectionAfter);

                  return (
                    <Accordion
                      key={decision.decisionId}
                      type="multiple"
                      className="rounded-xl border border-border/70 px-4"
                    >
                      <AccordionItem
                        value={decision.decisionId}
                        className="border-none"
                      >
                        <AccordionTrigger className="py-4 hover:no-underline">
                          <div className="flex min-w-0 flex-1 flex-col gap-3 pr-4 text-left">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">
                                {formatStatusLabel(decision.fromNode)} to{" "}
                                {formatStatusLabel(decision.toNode)}
                              </Badge>
                              <Badge variant="outline">
                                {formatStatusLabel(decision.reasonCode)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(decision.recordedAt)}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <p className="text-sm font-medium text-foreground">
                                {signal
                                  ? `${formatSourceLabel(signal.source)} triggered ${formatEventTypeLabel(signal.type)}`
                                  : `Signal ${decision.signalId}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatCount(decision.commands.length)} commands emitted
                              </p>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              <MetricMiniCard
                                icon={<WorkflowIcon className="size-3.5" />}
                                label="Before"
                                value={projectionBefore.value}
                                detail={projectionBefore.detail}
                              />
                              <MetricMiniCard
                                icon={<WorkflowIcon className="size-3.5" />}
                                label="After"
                                value={projectionAfter.value}
                                detail={projectionAfter.detail}
                              />
                            </div>

                            {decision.trace.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                  Trace
                                </p>
                                <div className="space-y-2">
                                  {decision.trace.map((entry, index) => (
                                    <div
                                      key={`${decision.decisionId}:trace:${index}`}
                                      className="rounded-xl border border-border/70 bg-muted/20 p-3"
                                    >
                                      <p className="text-xs font-medium text-foreground">
                                        {summarizeTraceEntry(entry).title}
                                      </p>
                                      {summarizeTraceEntry(entry).detail ? (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {summarizeTraceEntry(entry).detail}
                                        </p>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {decision.commands.length > 0 ? (
                              <div className="space-y-3">
                                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                  Commands
                                </p>
                                <div className="space-y-2">
                                  {decision.commands.map((command) => (
                                    <div
                                      key={command.commandId}
                                      className="rounded-xl border border-border/70 p-3"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge
                                          variant={badgeVariantForCommandSettlement(
                                            command.settled?.status ?? null
                                          )}
                                        >
                                          {command.settled
                                            ? formatStatusLabel(command.settled.status)
                                            : "Pending"}
                                        </Badge>
                                        <Badge variant="outline" className="font-mono">
                                          {formatLabel(command.kind)}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {command.commandId}
                                        </span>
                                      </div>
                                      {command.settled ? (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                          Settled {formatTimestamp(command.settled.recordedAt)}
                                        </p>
                                      ) : null}
                                      <ScrollArea className="mt-3 h-32 rounded-lg border border-border/70 bg-muted/20">
                                        <pre className="p-3 text-[11px] leading-5 text-muted-foreground whitespace-pre-wrap break-words">
                                          <code>{prettyValue(command.payload)}</code>
                                        </pre>
                                      </ScrollArea>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {decision.selectionMetadata ? (
                              <div className="space-y-2">
                                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                  Selection metadata
                                </p>
                                <ScrollArea className="h-32 rounded-lg border border-border/70 bg-muted/20">
                                  <pre className="p-3 text-[11px] leading-5 text-muted-foreground whitespace-pre-wrap break-words">
                                    <code>{prettyValue(decision.selectionMetadata)}</code>
                                  </pre>
                                </ScrollArea>
                              </div>
                            ) : null}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow event feed</CardTitle>
            <CardDescription>
              Raw persisted workflow history across signals, decisions, command
              emission, and settlement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No workflow history has been recorded yet.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {history.map((event) => {
                  const summary = summarizeHistoryEvent(event);

                  return (
                    <Accordion
                      key={event.eventId}
                      type="multiple"
                      className="rounded-xl border border-border/70 px-4"
                    >
                      <AccordionItem value={event.eventId} className="border-none">
                        <AccordionTrigger className="py-4 hover:no-underline">
                          <div className="flex min-w-0 flex-1 flex-col gap-3 pr-4 text-left">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">
                                #{formatCount(event.eventSequence)}
                              </Badge>
                              <Badge variant="outline">
                                {formatEventTypeLabel(event.kind)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(event.recordedAt)}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-foreground">
                              {summary.title}
                            </p>
                            {summary.detail ? (
                              <p className="text-xs text-muted-foreground">
                                {summary.detail}
                              </p>
                            ) : null}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="space-y-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Field</TableHead>
                                  <TableHead>Value</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                <WorkflowFieldRow
                                  label="Signal"
                                  value={event.signalType ?? "n/a"}
                                />
                                <WorkflowFieldRow
                                  label="Decision"
                                  value={event.decisionId ?? "n/a"}
                                />
                                <WorkflowFieldRow
                                  label="Command"
                                  value={event.commandId ?? "n/a"}
                                />
                                <WorkflowFieldRow
                                  label="Transition"
                                  value={`${formatStatusLabel(event.fromNode)} to ${formatStatusLabel(event.toNode)}`}
                                />
                                <WorkflowFieldRow
                                  label="Reason"
                                  value={event.reasonCode ? formatStatusLabel(event.reasonCode) : "n/a"}
                                />
                              </TableBody>
                            </Table>

                            <ScrollArea className="h-40 rounded-lg border border-border/70 bg-muted/20">
                              <pre className="p-3 text-[11px] leading-5 text-muted-foreground whitespace-pre-wrap break-words">
                                <code>{prettyValue(event.event)}</code>
                              </pre>
                            </ScrollArea>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MetricMiniCard(input: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {input.icon}
        {input.label}
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{input.value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{input.detail}</p>
    </div>
  );
}

function WorkflowFieldRow(input: { label: string; value: string }) {
  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">{input.label}</TableCell>
      <TableCell className="break-all text-muted-foreground">
        {input.value}
      </TableCell>
    </TableRow>
  );
}

function buildNodeRuns(
  workflow: SymphonyRuntimeWorkflowObservabilityResult,
  signalsById: ReadonlyMap<
    string,
    SymphonyRuntimeWorkflowObservabilityResult["replay"]["signals"][number]
  >
) {
  const decisions = [...workflow.decisions].sort(
    (left, right) => left.eventSequence - right.eventSequence
  );

  if (decisions.length === 0) {
    if (!workflow.snapshot?.currentNode) {
      return [];
    }

    return [
      {
        id: `step:${workflow.snapshot.currentNode}`,
        sequence: 1,
        nodeLabel: formatStatusLabel(workflow.snapshot.currentNode),
        status: workflow.snapshot.terminal ? ("terminal" as const) : ("current" as const),
        statusLabel: workflow.snapshot.terminal ? "Terminal" : "Current",
        enteredAt: formatTimestamp(workflow.workflow.insertedAt),
        exitedAt: null,
        triggerLabel: "Workflow created",
        reasonLabel: "Awaiting first decision",
        transitionLabel: formatStatusLabel(workflow.snapshot.currentNode),
        summary: "The workflow has been created but no router decision has been recorded yet.",
        commandSummary: `${formatCount(workflow.snapshot.pendingCommandCount)} pending commands`,
        settlementSummary: `${formatCount(workflow.replay.settledCommandCount)} settled commands`,
        commands: [],
        traceEntries: []
      }
    ];
  }

  return decisions.map((decision, index) => {
    const nextDecision = decisions[index + 1] ?? null;
    const signal = signalsById.get(decision.signalId) ?? null;
    const isLatest = index === decisions.length - 1;
    const status = workflow.snapshot?.terminal
      ? isLatest
        ? ("terminal" as const)
        : ("completed" as const)
      : isLatest
        ? ("current" as const)
        : ("completed" as const);
    const settledCount = decision.commands.filter((command) => command.settled).length;
    const failedCount = decision.commands.filter(
      (command) => command.settled?.status === "failed"
    ).length;

    return {
      id: decision.decisionId,
      sequence: index + 1,
      nodeLabel: formatStatusLabel(decision.toNode),
      status,
      statusLabel:
        status === "current"
          ? "Current"
          : status === "terminal"
            ? "Terminal"
            : "Completed",
      enteredAt: formatTimestamp(decision.recordedAt),
      exitedAt: nextDecision ? formatTimestamp(nextDecision.recordedAt) : null,
      triggerLabel: signal
        ? `${formatSourceLabel(signal.source)} · ${formatEventTypeLabel(signal.type)}`
        : `Signal ${decision.signalId}`,
      reasonLabel: formatStatusLabel(decision.reasonCode),
      transitionLabel: `${formatStatusLabel(decision.fromNode)} to ${formatStatusLabel(decision.toNode)}`,
      summary: buildNodeSummary(decision, signal),
      commandSummary:
        decision.commands.length === 0
          ? "No commands emitted"
          : `${formatCount(decision.commands.length)} emitted · ${formatCount(settledCount)} settled`,
      settlementSummary:
        failedCount > 0
          ? `${formatCount(failedCount)} failed settlements`
          : settledCount > 0
            ? "All settled commands succeeded"
            : "Awaiting command settlement",
      commands: decision.commands.map((command) => ({
        commandId: command.commandId,
        kindLabel: formatLabel(command.kind),
        statusLabel: command.settled
          ? formatStatusLabel(command.settled.status)
          : "Pending",
        detail: command.settled
          ? `Settled ${formatTimestamp(command.settled.recordedAt)}`
          : command.dedupeKey
            ? `Dedupe key ${command.dedupeKey}`
            : null
      })),
      traceEntries: decision.trace.map((entry, traceIndex) => ({
        key: `${decision.decisionId}:trace:${traceIndex}`,
        ...summarizeTraceEntry(entry)
      }))
    };
  });
}

function buildNodeSummary(
  decision: SymphonyRuntimeWorkflowObservabilityResult["decisions"][number],
  signal:
    | SymphonyRuntimeWorkflowObservabilityResult["replay"]["signals"][number]
    | null
): string {
  if (!signal) {
    return `Transitioned into ${formatStatusLabel(decision.toNode)} on ${formatStatusLabel(decision.reasonCode)}.`;
  }

  return `${formatSourceLabel(signal.source)} sent ${formatEventTypeLabel(signal.type)}, which moved the workflow into ${formatStatusLabel(decision.toNode)}.`;
}

function summarizeSignalPayload(payload: JsonValue): string {
  if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
    return String(payload ?? "No payload");
  }

  const entries = Object.entries(payload).slice(0, 3);
  if (entries.length === 0) {
    return "No payload fields captured.";
  }

  return entries
    .map(([key, value]) => `${formatLabel(key)}: ${summarizeJsonValue(value)}`)
    .join(" · ");
}

function summarizeJsonValue(value: JsonValue): string {
  if (value === null) {
    return "n/a";
  }

  if (Array.isArray(value)) {
    return `${formatCount(value.length)} values`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    return keys.length === 0 ? "empty object" : `${formatCount(keys.length)} fields`;
  }

  return String(value);
}

function summarizeProjection(payload: JsonValue): {
  value: string;
  detail: string;
} {
  if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
    return {
      value: "Projection unavailable",
      detail: "The router did not persist a readable projection summary."
    };
  }

  const currentNode =
    typeof payload.currentNode === "string" ? payload.currentNode : null;
  const terminal =
    typeof payload.terminal === "boolean" ? payload.terminal : null;
  const pendingCommands = Array.isArray(payload.pendingCommands)
    ? payload.pendingCommands.length
    : 0;

  return {
    value: currentNode ? formatStatusLabel(currentNode) : "No current node",
    detail: `${terminal ? "Terminal" : "Non-terminal"} · ${formatCount(pendingCommands)} pending commands`
  };
}

function summarizeTraceEntry(payload: JsonValue): {
  title: string;
  detail: string | null;
} {
  if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
    return {
      title: "Trace entry",
      detail: payload === null ? null : prettyValue(payload)
    };
  }

  const kind = typeof payload.kind === "string" ? payload.kind : "trace";
  const ref = typeof payload.ref === "string" ? payload.ref : null;
  const detail = "detail" in payload ? payload.detail : null;

  return {
    title: ref ? `${formatLabel(kind)} · ${ref}` : formatLabel(kind),
    detail: detail === null ? null : prettyValue(detail)
  };
}

function summarizeHistoryEvent(
  event: SymphonyRuntimeWorkflowObservabilityResult["history"][number]
): {
  title: string;
  detail: string | null;
} {
  switch (event.kind) {
    case "signal_recorded":
      return {
        title: event.signalType
          ? `${formatSourceLabel(event.signalSource)} recorded ${formatEventTypeLabel(event.signalType)}`
          : "Signal recorded",
        detail: event.signalId
      };
    case "decision_recorded":
      return {
        title: `${formatStatusLabel(event.fromNode)} to ${formatStatusLabel(event.toNode)}`,
        detail: event.reasonCode ? formatStatusLabel(event.reasonCode) : null
      };
    case "command_emitted":
      return {
        title: `Command emitted ${event.commandId ? `(${event.commandId})` : ""}`.trim(),
        detail: event.reasonCode ? formatStatusLabel(event.reasonCode) : null
      };
    case "command_settled": {
      const settledEvent =
        event.event &&
        typeof event.event === "object" &&
        !Array.isArray(event.event) &&
        "status" in event.event &&
        typeof event.event.status === "string"
          ? event.event.status
          : null;
      return {
        title: `${event.commandId ?? "Command"} ${formatStatusLabel(settledEvent ?? "settled")}`,
        detail: event.decisionId ?? null
      };
    }
    default:
      return {
        title: formatEventTypeLabel(event.kind),
        detail: null
      };
  }
}

function badgeVariantForStepStatus(status: "current" | "completed" | "terminal") {
  switch (status) {
    case "current":
      return "secondary" as const;
    case "terminal":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function badgeVariantForCommandSettlement(status: "succeeded" | "failed" | null) {
  switch (status) {
    case "failed":
      return "destructive" as const;
    case "succeeded":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}
