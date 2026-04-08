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
import { RunMachineLoadChart } from "@/features/runs/components/run-machine-load-chart";
import { RunTurnTokenChart } from "@/features/runs/components/run-turn-token-chart";
import { RunTurnsCard } from "@/features/runs/components/run-turns-card";
import { buildAgentRunViewModel } from "@/features/runs/model/agent-run-view-model";
import type { AgentRunResource } from "@/features/runs/hooks/use-agent-run";
import {
  formatCount,
  formatDuration,
  formatStatusLabel,
  formatTimestamp
} from "@/core/display-formatters";

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

      {viewModel && input.resource ? (
        <>
          <section className="flex flex-col gap-3">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {viewModel.runTitle}
              </h1>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {viewModel.metadata.find((row) => row.label === "Model")?.value ??
                    "Unavailable"}
                </Badge>
                <Badge variant="secondary">
                  {formatStatusLabel(input.resource.runDetail.run.status)}
                </Badge>
                <Badge variant="secondary">
                  {input.resource.runDetail.run.endedAt
                    ? `Ended ${formatTimestamp(input.resource.runDetail.run.endedAt)}`
                    : "Still running"}
                </Badge>
                <Badge variant="secondary">
                  {`Started ${formatTimestamp(input.resource.runDetail.run.startedAt)}`}
                </Badge>
                <Badge variant="outline">
                  {`${viewModel.metrics.find((metric) => metric.label === "Tokens")?.value ?? formatCount(input.resource.runDetail.run.totalTokens)} tokens`}
                </Badge>
                <Badge variant="outline">
                  {input.resource.runDetail.run.durationSeconds === null
                    ? "In progress"
                    : formatDuration(input.resource.runDetail.run.durationSeconds)}
                </Badge>
              </div>
              {viewModel.failureSummary ? (
                <p className="max-w-3xl text-sm text-destructive">
                  {viewModel.failureSummary}
                </p>
              ) : null}
            </div>
          </section>

          <section
            className={
              input.resource.runDetail.run.machineLoad
                ? "grid gap-4 xl:grid-cols-2"
                : "grid gap-4"
            }
          >
            <RunTurnTokenChart rows={viewModel.turnTokens.rows} />
            <RunMachineLoadChart machineLoad={input.resource.runDetail.run.machineLoad} />
          </section>

          <RunTurnsCard
            title="Turns"
            description="Sort by started, ended, or token load to scan the run history."
            rows={viewModel.turnRows}
          />

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">
                  Turn stream
                </h2>
                <p className="text-sm text-muted-foreground">
                  Newest turns first. Use this to scan prompt flow before opening a full turn drilldown.
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
