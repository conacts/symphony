"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { RunDebugPanel } from "@/features/runs/components/run-debug-panel";
import { RunExecutionDurationChart } from "@/features/runs/components/run-execution-duration-chart";
import { RunTurnLatencyChart } from "@/features/runs/components/run-turn-latency-chart";
import { RunTurnTokenChart } from "@/features/runs/components/run-turn-token-chart";
import { RunTurnsCard } from "@/features/runs/components/run-turns-card";
import {
  buildAgentRunViewModel
} from "@/features/runs/model/agent-run-view-model";
import type { AgentRunResource } from "@/features/runs/hooks/use-agent-run";

const TRANSCRIPT_TURN_PAGE_SIZE = 6;

export function RunTranscriptView(input: {
  error: string | null;
  loading: boolean;
  resource: AgentRunResource | null;
}) {
  const viewModel = input.resource
    ? buildAgentRunViewModel({
        runDetail: input.resource.runDetail,
        runArtifacts: input.resource.runArtifacts
      })
    : null;
  const [turnPage, setTurnPage] = useState(1);
  const transcriptTurns = useMemo(
    () => (viewModel ? [...viewModel.transcriptTurns].reverse() : []),
    [viewModel]
  );
  const totalTurnPages = Math.max(
    1,
    Math.ceil(transcriptTurns.length / TRANSCRIPT_TURN_PAGE_SIZE)
  );

  useEffect(() => {
    setTurnPage(1);
  }, [viewModel?.runId, transcriptTurns.length]);

  useEffect(() => {
    if (turnPage > totalTurnPages) {
      setTurnPage(totalTurnPages);
    }
  }, [totalTurnPages, turnPage]);

  const visibleTranscriptTurns = useMemo(() => {
    const start = (turnPage - 1) * TRANSCRIPT_TURN_PAGE_SIZE;
    return transcriptTurns.slice(start, start + TRANSCRIPT_TURN_PAGE_SIZE);
  }, [transcriptTurns, turnPage]);
  const transcriptStart =
    transcriptTurns.length === 0
      ? 0
      : (turnPage - 1) * TRANSCRIPT_TURN_PAGE_SIZE + 1;
  const transcriptEnd =
    transcriptTurns.length === 0
      ? 0
      : Math.min(turnPage * TRANSCRIPT_TURN_PAGE_SIZE, transcriptTurns.length);

  return (
    <div className="flex flex-col gap-8">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Run transcript degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.resource?.agentError ? (
        <Alert>
          <AlertTitle>Transcript unavailable</AlertTitle>
          <AlertDescription>{input.resource.agentError}</AlertDescription>
        </Alert>
      ) : null}

      {input.loading && !viewModel ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Loading run transcript…
          </CardContent>
        </Card>
      ) : null}

      {viewModel ? (
        <>
          <section className="flex flex-col gap-5">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {viewModel.runTitle}
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {viewModel.statusSummary}
              </p>
              {viewModel.failureSummary ? (
                <p className="max-w-3xl text-sm text-destructive">
                  {viewModel.failureSummary}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {viewModel.metrics.slice(0, 4).map((metric) => (
                <Card key={metric.label} className="border-border/70">
                  <CardHeader className="space-y-1 pb-3">
                    <CardDescription>{metric.label}</CardDescription>
                    <CardTitle className="text-xl">{metric.value}</CardTitle>
                  </CardHeader>
                  {metric.detail ? (
                    <CardContent className="pt-0 text-sm text-muted-foreground">
                      {metric.detail}
                    </CardContent>
                  ) : null}
                </Card>
              ))}
            </div>
          </section>

          <RunTurnsCard
            title="Turns"
            description="Runs aggregate into turns here. Open an individual turn to inspect its full transcript, commands, tools, reasoning, and task updates."
            rows={viewModel.turnRows}
          />

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">
                  Turn stream
                </h2>
                <p className="text-sm text-muted-foreground">
                  Newest turns first. Use this to scan prompt flow and execution shape before opening a full turn drilldown.
                </p>
              </div>
              {transcriptTurns.length > 0 ? (
                <div className="flex items-center gap-2 self-start lg:self-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={turnPage <= 1}
                    onClick={() => setTurnPage((page) => Math.max(1, page - 1))}
                  >
                    Newer
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Showing {transcriptStart}-{transcriptEnd} of {transcriptTurns.length}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={turnPage >= totalTurnPages}
                    onClick={() =>
                      setTurnPage((page) => Math.min(totalTurnPages, page + 1))
                    }
                  >
                    Older
                  </Button>
                </div>
              ) : null}
            </div>

            {visibleTranscriptTurns.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {visibleTranscriptTurns.map((turn) => {
                  const turnRow = viewModel.turnRows.find(
                    (row) => row.turnId === turn.turnId
                  );

                  return (
                    <Card key={turn.turnId} className="border-border/70">
                      <CardHeader className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <CardTitle className="text-base">
                              Turn {turn.turnSequence}
                            </CardTitle>
                            <CardDescription>
                              {turn.startedAt} to {turn.endedAt}
                            </CardDescription>
                          </div>
                          <Badge variant="secondary">{turn.status}</Badge>
                        </div>
                        <p className="text-sm leading-6 text-foreground">
                          {truncatePrompt(turn.promptText)}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{turn.countsSummary}</Badge>
                          <Badge variant="outline">{turn.tokenSummary}</Badge>
                        </div>
                        {turn.activitySummary.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {turn.activitySummary.slice(0, 4).map((card) => (
                              <div
                                key={`${turn.turnId}:${card.label}`}
                                className="rounded-lg border border-border/60 p-3"
                              >
                                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                  {card.label}
                                </p>
                                <p className="mt-2 text-sm font-semibold">
                                  {card.value}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {card.detail}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No activity summary was captured for this turn.
                          </p>
                        )}
                        {turnRow ? (
                          <div>
                            <Button asChild size="sm" variant="outline">
                              <Link href={turnRow.href}>Open turn</Link>
                            </Button>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  No transcript turns were captured for this run.
                </CardContent>
              </Card>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Turn tokens
              </h2>
              <p className="text-sm text-muted-foreground">
                Turn-level token load split across input, cached input, and output.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {viewModel.turnTokens.cards.map((card) => (
                <Card key={card.label} className="border-border/70">
                  <CardHeader className="space-y-1 pb-3">
                    <CardDescription>{card.label}</CardDescription>
                    <CardTitle className="text-lg break-all">{card.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-muted-foreground">
                    {card.detail}
                  </CardContent>
                </Card>
              ))}
            </div>
            <RunTurnTokenChart rows={viewModel.turnTokens.rows} />
          </section>

          <section className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Turn latency
              </h2>
              <p className="text-sm text-muted-foreground">
                Turn-level wall-clock timing split across reasoning, commands, tools, and assistant output.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {viewModel.turnLatency.cards.map((card) => (
                <Card key={card.label} className="border-border/70">
                  <CardHeader className="space-y-1 pb-3">
                    <CardDescription>{card.label}</CardDescription>
                    <CardTitle className="text-lg break-all">{card.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-muted-foreground">
                    {card.detail}
                  </CardContent>
                </Card>
              ))}
            </div>
            <RunTurnLatencyChart rows={viewModel.turnLatency.rows} />
          </section>

          <section className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Execution performance
              </h2>
              <p className="text-sm text-muted-foreground">
                Local command and tool execution hotspots for this run before you read the full conversation.
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <RunExecutionDurationChart
                title="Command executions"
                description={viewModel.executionPerformance.commandSummary}
                emptyText="No command executions were captured for this run."
                rows={viewModel.executionPerformance.commandRows}
              />
              <RunExecutionDurationChart
                title="Tool calls"
                description={viewModel.executionPerformance.toolSummary}
                emptyText="No tool calls were captured for this run."
                rows={viewModel.executionPerformance.toolRows}
              />
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Pi responses
              </h2>
              <p className="text-sm text-muted-foreground">
                Typed response metadata captured from Pi message-end events.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {viewModel.piResponseCards.map((card) => (
                <Card key={card.label} className="border-border/70">
                  <CardHeader className="space-y-1 pb-3">
                    <CardDescription>{card.label}</CardDescription>
                    <CardTitle className="text-lg break-all">{card.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-muted-foreground">
                    {card.detail}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Run context</h2>
              <p className="text-sm text-muted-foreground">
                Supporting runtime, provider, and workspace details for the conversation above.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {viewModel.metrics.slice(4).map((metric) => (
                <Card key={metric.label} className="border-border/70">
                  <CardHeader className="space-y-1 pb-3">
                    <CardDescription>{metric.label}</CardDescription>
                    <CardTitle className="text-lg">{metric.value}</CardTitle>
                  </CardHeader>
                  {metric.detail ? (
                    <CardContent className="pt-0 text-sm text-muted-foreground">
                      {metric.detail}
                    </CardContent>
                  ) : null}
                </Card>
              ))}
              {viewModel.metadata.map((row) => (
                <Card key={row.label} className="border-border/70">
                  <CardHeader className="space-y-1 pb-3">
                    <CardDescription>{row.label}</CardDescription>
                    <CardTitle className="text-lg break-all">{row.value}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Machine load
              </h2>
              <p className="text-sm text-muted-foreground">
                Peak and average host pressure captured while this run was active.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {viewModel.machineLoadCards.map((card) => (
                <Card key={card.label} className="border-border/70">
                  <CardHeader className="space-y-1 pb-3">
                    <CardDescription>{card.label}</CardDescription>
                    <CardTitle className="text-lg">{card.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-muted-foreground">
                    {card.detail}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Debug context
              </h2>
              <p className="text-sm text-muted-foreground">
                Repository snapshots and raw runtime events for deeper debugging.
              </p>
            </div>
            <RunDebugPanel viewModel={viewModel} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function truncatePrompt(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 260) {
    return normalized;
  }

  return `${normalized.slice(0, 257)}...`;
}
