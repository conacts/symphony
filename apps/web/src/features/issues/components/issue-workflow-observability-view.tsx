import React from "react";
import type {
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
import {
  formatCount,
  formatLabel,
  formatStatusLabel,
  formatTimestamp
} from "@/core/display-formatters";
import { cn } from "@/lib/utils";

type WorkflowModuleObservation = NonNullable<
  SymphonyRuntimeWorkflowObservabilityResult["currentModule"]
>;
type WorkflowRecentModuleRun =
  SymphonyRuntimeWorkflowObservabilityResult["recentModuleRuns"][number];
type WorkflowDecision =
  SymphonyRuntimeWorkflowObservabilityResult["decisions"][number];
type WorkflowHistoryEntry =
  SymphonyRuntimeWorkflowObservabilityResult["history"][number];
type WorkflowRouterDecision = NonNullable<
  SymphonyRuntimeWorkflowObservabilityResult["routerDecision"]
>;

export function IssueWorkflowObservabilityView(input: {
  runtimeIssue: SymphonyRuntimeIssueResult | null;
  workflow: SymphonyRuntimeWorkflowObservabilityResult;
}) {
  const selectedModel =
    input.runtimeIssue?.operator.pi.selectedModel ??
    input.runtimeIssue?.operator.pi.defaultModel ??
    null;
  const trackerState =
    input.workflow.trackerState ?? input.runtimeIssue?.tracked.state ?? null;
  const runtimeStatus = input.runtimeIssue?.status ?? null;
  const currentShell = input.workflow.snapshot?.currentNode ?? null;
  const currentModule = input.workflow.currentModule;
  const routerDecision = input.workflow.routerDecision;
  const recentRuns = input.workflow.recentModuleRuns;
  const decisionsById = new Map(
    input.workflow.decisions.map((decision) => [decision.decisionId, decision] as const)
  );
  const rawRouterDecision =
    routerDecision === null
      ? null
      : (decisionsById.get(routerDecision.decisionId) ?? null);
  const latestRun = recentRuns[0] ?? null;

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
              Current module, router choice, and recent module runs for this issue.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Current shell"
            value={currentShell ? formatStatusLabel(currentShell) : "n/a"}
            detail={
              input.workflow.snapshot?.terminal
                ? "Workflow is in a terminal shell state."
                : "Workflow remains active in the router shell."
            }
          />
          <SummaryCard
            label="Current module"
            value={currentModule ? currentModule.module.summary : "n/a"}
            detail={
              currentModule
                ? `${formatStatusLabel(currentModule.state)} · ${formatTimestamp(currentModule.selectedAt)}`
                : "No module is currently selected."
            }
          />
          <SummaryCard
            label="Router decisions"
            value={formatCount(input.workflow.replay.recordedDecisionCount)}
            detail={
              routerDecision
                ? `${formatStatusLabel(routerDecision.selectionMode)} · ${formatStatusLabel(routerDecision.reasonCode)}`
                : "No intelligent-flow selection metadata has been recorded."
            }
          />
          <SummaryCard
            label="Module runs"
            value={formatCount(recentRuns.length)}
            detail={
              latestRun
                ? `${formatStatusLabel(latestRun.state)} · ${formatTimestamp(latestRun.selectedAt)}`
                : "No module runs have started for this workflow yet."
            }
          />
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-2">
        <CurrentModuleCard
          currentModule={currentModule}
          selectedModel={selectedModel}
        />
        <RouterDecisionCard
          routerDecision={routerDecision}
          rawDecision={rawRouterDecision}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent module runs</CardTitle>
          <CardDescription>
            Each run shows the selected module, attempt status, and produced evidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No module runs have started for this workflow yet.
            </p>
          ) : (
            <div className="grid gap-3">
              {recentRuns.map((run) => (
                <ModuleRunCard key={buildModuleRunKey(run)} run={run} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run logs</CardTitle>
          <CardDescription>
            Timeline-style logs for each module run, using the persisted router
            decision and execution events.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Per-run logs will appear once a module attempt starts.
            </p>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={recentRuns.map((run) => buildModuleRunKey(run))}
              className="space-y-3"
            >
              {recentRuns.map((run) => {
                const fullDecision =
                  run.decision === null
                    ? null
                    : (decisionsById.get(run.decision.decisionId) ?? null);
                const logEntries = buildModuleRunLogEntries({
                  run,
                  decision: fullDecision
                });

                return (
                  <AccordionItem
                    key={buildModuleRunKey(run)}
                    value={buildModuleRunKey(run)}
                    className="rounded-xl border border-border/70 px-4"
                  >
                    <AccordionTrigger className="py-4 hover:no-underline">
                      <div className="flex min-w-0 flex-1 flex-col gap-3 pr-4 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            {formatStatusLabel(run.state)}
                          </Badge>
                          <Badge variant="outline" className="font-mono">
                            {run.module.moduleId}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(run.selectedAt)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {run.module.summary}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {buildModuleAttemptLabel(run)}
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="space-y-3">
                        {logEntries.map((entry) => (
                          <RunLogEntry key={entry.key} entry={entry} />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <WorkflowEventLogCard history={input.workflow.history} />
    </div>
  );
}

function CurrentModuleCard(input: {
  currentModule: WorkflowModuleObservation | null;
  selectedModel: string | null;
}) {
  if (!input.currentModule) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current module</CardTitle>
          <CardDescription>
            The router has not selected a module for this issue yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No module is currently selected.
          </p>
        </CardContent>
      </Card>
    );
  }

  const modelLabel =
    input.currentModule.modelProfileId ?? input.selectedModel ?? "n/a";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current module</CardTitle>
        <CardDescription>
          What the router believes should happen next for this workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{formatStatusLabel(input.currentModule.state)}</Badge>
            <Badge variant="outline">{formatStatusLabel(input.currentModule.module.phase)}</Badge>
            <Badge variant="outline" className="font-mono">
              {input.currentModule.module.moduleId}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">
              {input.currentModule.module.summary}
            </p>
            <p className="text-sm text-muted-foreground">
              {input.currentModule.summary}
            </p>
            <p className="text-sm text-muted-foreground">
              {input.currentModule.module.description}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <DetailBlock label="Model" value={modelLabel} />
          <DetailBlock
            label="Selected"
            value={formatTimestamp(input.currentModule.selectedAt)}
          />
          <DetailBlock
            label="Work epoch"
            value={String(input.currentModule.workEpoch)}
          />
          <DetailBlock
            label="Attempt"
            value={
              input.currentModule.attempt === null
                ? "Not started"
                : String(input.currentModule.attempt)
            }
          />
          <DetailBlock
            label="Started"
            value={
              input.currentModule.startedAt
                ? formatTimestamp(input.currentModule.startedAt)
                : "Run not started yet"
            }
          />
          <DetailBlock
            label="Completed"
            value={
              input.currentModule.completedAt
                ? formatTimestamp(input.currentModule.completedAt)
                : "Still active"
            }
          />
          <DetailBlock
            label="Execution kind"
            value={formatStatusLabel(input.currentModule.module.executionKind)}
          />
          <DetailBlock
            label="Runtime support"
            value={input.currentModule.module.runtimeSupported ? "Supported" : "Unavailable"}
          />
          <DetailBlock
            label="Requires evidence"
            value={formatEvidenceIdList(input.currentModule.module.requiresEvidenceIds)}
          />
          <DetailBlock
            label="Produces evidence"
            value={formatEvidenceIdList(input.currentModule.module.producesEvidenceIds)}
          />
        </div>

        {input.currentModule.decision ? (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Router decision
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {input.currentModule.decision.selectionSummary ??
                formatStatusLabel(input.currentModule.decision.reasonCode)}
            </p>
            {input.currentModule.decision.selectionRationale ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {input.currentModule.decision.selectionRationale}
              </p>
            ) : null}
          </div>
        ) : null}

        {input.currentModule.evidenceProduced.length > 0 ? (
          <EvidenceList evidence={input.currentModule.evidenceProduced} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function RouterDecisionCard(input: {
  routerDecision: WorkflowRouterDecision | null;
  rawDecision: WorkflowDecision | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Router decision</CardTitle>
        <CardDescription>
          Why the router selected this module and what it considered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {input.routerDecision ? (
          <>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {formatStatusLabel(input.routerDecision.selectionMode)}
                </Badge>
                <Badge variant="outline">
                  {formatStatusLabel(input.routerDecision.reasonCode)}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  {input.routerDecision.selectedModule.moduleId}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold text-foreground">
                  {input.routerDecision.selectedModule.summary}
                </p>
                <p className="text-sm text-foreground">
                  {input.routerDecision.selectionSummary}
                </p>
                <p className="text-sm text-muted-foreground">
                  {input.routerDecision.selectionRationale}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailBlock
                label="Recorded"
                value={formatTimestamp(input.routerDecision.recordedAt)}
              />
              <DetailBlock
                label="Policy"
                value={input.routerDecision.policyId}
              />
              <DetailBlock
                label="Confidence"
                value={
                  input.routerDecision.confidence === null
                    ? "n/a"
                    : `${Math.round(input.routerDecision.confidence * 100)}%`
                }
              />
              <DetailBlock
                label="Fallback"
                value={input.routerDecision.fallbackReason ?? "No fallback used"}
              />
            </div>

            <CandidateList
              title={`Admissible candidates (${formatCount(input.routerDecision.admissibleCandidates.length)})`}
              candidates={input.routerDecision.admissibleCandidates}
            />
            <CandidateList
              title={`Rejected candidates (${formatCount(input.routerDecision.rejectedCandidates.length)})`}
              candidates={input.routerDecision.rejectedCandidates}
            />

            {input.rawDecision ? (
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Decision internals
                </p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <DetailBlock
                    label="Decision id"
                    value={input.rawDecision.decisionId}
                  />
                  <DetailBlock
                    label="Event sequence"
                    value={String(input.rawDecision.eventSequence)}
                  />
                  <DetailBlock
                    label="Signal id"
                    value={input.rawDecision.signalId}
                  />
                  <DetailBlock
                    label="From node"
                    value={input.rawDecision.fromNode ?? "n/a"}
                  />
                  <DetailBlock
                    label="To node"
                    value={input.rawDecision.toNode ?? "n/a"}
                  />
                  <DetailBlock
                    label="Edge"
                    value={input.rawDecision.edgeId ?? "n/a"}
                  />
                  <DetailBlock
                    label="Commands"
                    value={formatCount(input.rawDecision.commands.length)}
                  />
                  <DetailBlock
                    label="Trace entries"
                    value={formatCount(input.rawDecision.trace.length)}
                  />
                  <DetailBlock
                    label="Inserted"
                    value={formatTimestamp(input.rawDecision.insertedAt)}
                  />
                </div>

                <VerboseJsonBlock
                  label="Projection before"
                  value={input.rawDecision.projectionBefore}
                />
                <VerboseJsonBlock
                  label="Projection after"
                  value={input.rawDecision.projectionAfter}
                />
                <VerboseJsonBlock
                  label="Commands"
                  value={input.rawDecision.commands}
                />
                {input.rawDecision.selectionMetadata ? (
                  <VerboseJsonBlock
                    label="Selection metadata"
                    value={input.rawDecision.selectionMetadata}
                  />
                ) : null}
                {input.rawDecision.trace.length > 0 ? (
                  <VerboseJsonBlock
                    label="Decision trace"
                    value={input.rawDecision.trace}
                  />
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No intelligent-flow selection metadata has been recorded for this
            workflow yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ModuleRunCard(input: {
  run: WorkflowRecentModuleRun;
}) {
  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{formatStatusLabel(input.run.state)}</Badge>
            <Badge variant="outline">{formatStatusLabel(input.run.module.phase)}</Badge>
            <Badge variant="outline" className="font-mono">
              {input.run.module.moduleId}
            </Badge>
          </div>
          <p className="text-base font-semibold text-foreground">
            {input.run.module.summary}
          </p>
          <p className="text-sm text-muted-foreground">{input.run.summary}</p>
          <p className="text-sm text-muted-foreground">
            {input.run.module.description}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{buildModuleAttemptLabel(input.run)}</p>
          <p>{formatTimestamp(input.run.selectedAt)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DetailBlock
          label="Model"
          value={input.run.modelProfileId ?? "n/a"}
        />
        <DetailBlock
          label="Started"
          value={
            input.run.startedAt ? formatTimestamp(input.run.startedAt) : "n/a"
          }
        />
        <DetailBlock
          label="Completed"
          value={
            input.run.completedAt ? formatTimestamp(input.run.completedAt) : "n/a"
          }
        />
        <DetailBlock
          label="Reason"
          value={
            input.run.reasonCode ? formatStatusLabel(input.run.reasonCode) : "n/a"
          }
        />
        <DetailBlock
          label="Execution kind"
          value={formatStatusLabel(input.run.module.executionKind)}
        />
        <DetailBlock
          label="Requires evidence"
          value={formatEvidenceIdList(input.run.module.requiresEvidenceIds)}
        />
        <DetailBlock
          label="Produces evidence"
          value={formatEvidenceIdList(input.run.module.producesEvidenceIds)}
        />
      </div>

      {input.run.evidenceProduced.length > 0 ? (
        <div className="mt-4">
          <EvidenceList evidence={input.run.evidenceProduced} />
        </div>
      ) : null}
    </div>
  );
}

function CandidateList(input: {
  title: string;
  candidates:
    | WorkflowRouterDecision["admissibleCandidates"]
    | WorkflowRouterDecision["rejectedCandidates"];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {input.title}
      </p>
      {input.candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No candidates recorded.</p>
      ) : (
        <div className="space-y-2">
          {input.candidates.map((candidate) => (
            <div
              key={`${candidate.module.moduleId}:${candidate.reasonCode}`}
              className={cn(
                "rounded-xl border p-3",
                candidate.selected
                  ? "border-sky-300/60 bg-sky-50/50"
                  : "border-border/70 bg-muted/20"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={candidate.selected ? "secondary" : "outline"}>
                  {candidate.selected ? "Selected" : formatStatusLabel(candidate.reasonCode)}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  {candidate.module.moduleId}
                </Badge>
                {candidate.rank !== null ? (
                  <span className="text-xs text-muted-foreground">
                    Rank {candidate.rank + 1}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">
                {candidate.module.summary}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {candidate.summary}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceList(input: {
  evidence: WorkflowModuleObservation["evidenceProduced"];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Evidence produced
      </p>
      <div className="space-y-2">
        {input.evidence.map((evidence) => (
          <div
            key={`${evidence.evidenceId}:${evidence.summary}`}
            className="rounded-xl border border-border/70 bg-muted/20 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{formatLabel(evidence.evidenceId)}</Badge>
              <span className="text-xs text-muted-foreground">
                {formatCount(evidence.artifacts.length)} artifacts
              </span>
            </div>
            <p className="mt-2 text-sm text-foreground">{evidence.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowEventLogCard(input: {
  history: ReadonlyArray<WorkflowHistoryEntry>;
}) {
  const orderedHistory = [...input.history].sort(
    (left, right) => right.eventSequence - left.eventSequence
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow event log</CardTitle>
        <CardDescription>
          Raw workflow events in reverse chronological order, including router
          and command payloads.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {orderedHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No workflow events have been recorded for this issue yet.
          </p>
        ) : (
          <div className="space-y-3">
            {orderedHistory.map((event) => (
              <div
                key={event.eventId}
                className="rounded-xl border border-border/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        #{event.eventSequence}
                      </Badge>
                      <Badge variant="outline">
                        {formatStatusLabel(event.kind)}
                      </Badge>
                      {event.signalType ? (
                        <Badge variant="outline" className="font-mono">
                          {event.signalType}
                        </Badge>
                      ) : null}
                      {event.commandId ? (
                        <Badge variant="outline" className="font-mono">
                          {event.commandId}
                        </Badge>
                      ) : null}
                      {event.decisionId ? (
                        <Badge variant="outline" className="font-mono">
                          {event.decisionId}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {buildHistoryEventSummary(event)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {buildHistoryEventDetail(event)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{formatTimestamp(event.recordedAt)}</p>
                    <p className="font-mono">{event.eventId}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <DetailBlock
                    label="Reason"
                    value={event.reasonCode ? formatStatusLabel(event.reasonCode) : "n/a"}
                  />
                  <DetailBlock
                    label="Signal source"
                    value={event.signalSource ? formatStatusLabel(event.signalSource) : "n/a"}
                  />
                  <DetailBlock
                    label="From -> to"
                    value={buildHistoryTransitionLabel(event)}
                  />
                  <DetailBlock
                    label="Edge"
                    value={event.edgeId ?? "n/a"}
                  />
                </div>

                <div className="mt-4">
                  <VerboseJsonBlock label="Recorded payload" value={event.event} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard(input: {
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

function DetailBlock(input: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {input.label}
      </p>
      <p className="mt-2 text-sm text-foreground">{input.value}</p>
    </div>
  );
}

function RunLogEntry(input: {
  entry: {
    key: string;
    label: string;
    at: string;
    detail: string;
  };
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{input.entry.label}</p>
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(input.entry.at)}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{input.entry.detail}</p>
    </div>
  );
}

function VerboseJsonBlock(input: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {input.label}
      </p>
      <pre className="overflow-x-auto rounded-xl border border-border/70 bg-muted/20 p-3 text-xs leading-5 text-foreground">
        {JSON.stringify(input.value, null, 2)}
      </pre>
    </div>
  );
}

function buildModuleRunLogEntries(input: {
  run: WorkflowRecentModuleRun;
  decision: WorkflowDecision | null;
}): Array<{
  key: string;
  label: string;
  at: string;
  detail: string;
}> {
  const entries: Array<{
    key: string;
    label: string;
    at: string;
    detail: string;
  }> = [
    {
      key: `${buildModuleRunKey(input.run)}:selected`,
      label: "Selected",
      at: input.run.selectedAt,
      detail:
        input.run.decision?.selectionSummary ??
        `${input.run.module.summary} was selected by the router.`
    }
  ];

  if (input.run.decision?.selectionRationale) {
    entries.push({
      key: `${buildModuleRunKey(input.run)}:rationale`,
      label: "Rationale",
      at: input.run.decision.recordedAt,
      detail: input.run.decision.selectionRationale
    });
  }

  if (input.run.startedAt) {
    entries.push({
      key: `${buildModuleRunKey(input.run)}:started`,
      label: "Started",
      at: input.run.startedAt,
      detail:
        input.run.modelProfileId === null
          ? "Run started."
          : `Run started with model profile ${input.run.modelProfileId}.`
    });
  }

  const executionCommand =
    input.decision?.commands.find(
      (command) => command.commandId === input.run.executionId
    ) ?? null;
  if (executionCommand?.settled) {
    entries.push({
      key: `${buildModuleRunKey(input.run)}:command`,
      label: "Command settled",
      at: executionCommand.settled.recordedAt,
      detail: `capability.execute settled ${formatStatusLabel(
        executionCommand.settled.status
      )}.`
    });
  }

  if (input.run.completedAt) {
    entries.push({
      key: `${buildModuleRunKey(input.run)}:completed`,
      label: formatStatusLabel(input.run.state),
      at: input.run.completedAt,
      detail: buildCompletionDetail(input.run)
    });
  }

  for (const evidence of input.run.evidenceProduced) {
    entries.push({
      key: `${buildModuleRunKey(input.run)}:evidence:${evidence.evidenceId}`,
      label: "Evidence",
      at: input.run.completedAt ?? input.run.startedAt ?? input.run.selectedAt,
      detail: `${formatLabel(evidence.evidenceId)} · ${evidence.summary}`
    });
  }

  return entries;
}

function buildCompletionDetail(run: WorkflowRecentModuleRun): string {
  switch (run.state) {
    case "failed":
      return [run.summary, run.failureKind, run.reasonCode]
        .filter((value): value is string => value !== null && value.length > 0)
        .join(" · ");
    case "blocked":
    case "changes_requested":
    case "clarification_requested":
      return [run.summary, run.reasonCode]
        .filter((value): value is string => value !== null && value.length > 0)
        .join(" · ");
    default:
      return run.summary;
  }
}

function buildModuleAttemptLabel(run: WorkflowRecentModuleRun): string {
  const attemptLabel =
    run.attempt === null ? "Selection pending" : `Attempt ${run.attempt}`;
  return `Work epoch ${run.workEpoch} · ${attemptLabel}`;
}

function buildModuleRunKey(run: WorkflowRecentModuleRun): string {
  return run.executionId ?? `${run.module.moduleId}:${run.workEpoch}:${run.attempt ?? "selected"}`;
}

function formatEvidenceIdList(evidenceIds: ReadonlyArray<string>): string {
  if (evidenceIds.length === 0) {
    return "None";
  }

  return evidenceIds.map((evidenceId) => formatLabel(evidenceId)).join(", ");
}

function buildHistoryTransitionLabel(event: WorkflowHistoryEntry): string {
  if (event.fromNode === null && event.toNode === null) {
    return "n/a";
  }

  return `${event.fromNode ?? "?"} -> ${event.toNode ?? "?"}`;
}

function buildHistoryEventSummary(event: WorkflowHistoryEntry): string {
  switch (event.kind) {
    case "signal_recorded":
      return event.signalType
        ? `Signal recorded: ${event.signalType}`
        : "Signal recorded";
    case "decision_recorded":
      return event.decisionId
        ? `Router decision recorded: ${event.decisionId}`
        : "Router decision recorded";
    case "command_emitted":
      return event.commandId
        ? `Command emitted: ${event.commandId}`
        : "Command emitted";
    case "command_settled":
      return event.commandId
        ? `Command settled: ${event.commandId}`
        : "Command settled";
  }
}

function buildHistoryEventDetail(event: WorkflowHistoryEntry): string {
  const details = [
    buildHistoryTransitionLabel(event) === "n/a"
      ? null
      : `Route ${buildHistoryTransitionLabel(event)}`,
    event.reasonCode ? formatStatusLabel(event.reasonCode) : null,
    event.signalSource ? `Source ${formatStatusLabel(event.signalSource)}` : null
  ].filter((value): value is string => value !== null);

  if (details.length === 0) {
    return "Raw event payload shown below.";
  }

  return details.join(" · ");
}
