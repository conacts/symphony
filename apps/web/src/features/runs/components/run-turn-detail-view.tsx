"use client";

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import { formatCount, formatDurationMilliseconds } from "@/core/display-formatters";
import { RunTurnResourceChart } from "@/features/runs/components/run-turn-resource-chart";
import { RunTurnTokenChart } from "@/features/runs/components/run-turn-token-chart";
import { RunTurnToolCallsChart } from "@/features/runs/components/run-turn-tool-calls-chart";
import { RunTranscriptTurn } from "@/features/runs/components/run-transcript-turn";
import {
  buildAgentRunViewModel,
  type AgentRunTranscriptEntry
} from "@/features/runs/model/agent-run-view-model";
import type { AgentRunResource } from "@/features/runs/hooks/use-agent-run";

export function RunTurnDetailView(input: {
  error: string | null;
  loading: boolean;
  resource: AgentRunResource | null;
  turnId: string;
  onOpenOverflow: (entry: AgentRunTranscriptEntry) => void | Promise<void>;
}) {
  const viewModel = input.resource
    ? buildAgentRunViewModel({
        runDetail: input.resource.runDetail,
        runArtifacts: input.resource.runArtifacts
      })
    : null;
  const turn = viewModel?.transcriptTurns.find(
    (candidate) => candidate.turnId === input.turnId
  );
  const turnTokenRow = viewModel?.turnTokens.rows.find(
    (candidate) => candidate.turnLabel === `Turn ${turn?.turnSequence ?? 0}`
  );
  const turnCommands =
    input.resource?.runArtifacts?.commandExecutions.filter(
      (candidate) => candidate.turnId === input.turnId
    ) ?? [];
  const modelValue =
    viewModel?.metadata.find((row) => row.label === "Model")?.value ?? "Unavailable";
  const turnDuration =
    turn?.startedAtIso && turn?.endedAtIso
      ? Math.max(0, Date.parse(turn.endedAtIso) - Date.parse(turn.startedAtIso))
      : null;

  return (
    <div className="flex flex-col gap-8">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Turn detail degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel && turn ? (
        <>
          <div className="flex min-h-[calc(100svh-5.5rem)] flex-col gap-8 md:min-h-[calc(100svh-6.5rem)]">
            <section className="flex flex-col gap-3">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                  Turn {turn.turnSequence}
                </h1>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{modelValue}</Badge>
                  <Badge variant="secondary">Started {turn.startedAt}</Badge>
                  <Badge variant="secondary">
                    {turn.endedAtIso ? `Ended ${turn.endedAt}` : "Still running"}
                  </Badge>
                  <Badge variant="outline">{turn.status}</Badge>
                  <Badge variant="outline">
                    {turnDuration === null
                      ? "In progress"
                      : formatDurationMilliseconds(turnDuration)}
                  </Badge>
                  <Badge variant="outline">
                    {`${formatCount(turn.totalTokens)} tokens`}
                  </Badge>
                  <Badge variant="outline">
                    {`${formatCount(turn.commandCount)} commands`}
                  </Badge>
                  <Badge variant="outline">
                    {`${formatCount(turn.toolCount)} tools`}
                  </Badge>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:flex-1 xl:grid-cols-2 xl:grid-rows-[minmax(0,1fr)_auto]">
              <RunTurnTokenChart rows={turnTokenRow ? [turnTokenRow] : []} />
              <RunTurnResourceChart commands={turnCommands} />
              <RunTurnToolCallsChart turn={turn} className="xl:col-span-2" />
            </section>
          </div>

          <RunTranscriptTurn turn={turn} onOpenOverflow={input.onOpenOverflow} />
        </>
      ) : input.loading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Loading turn detail…
          </CardContent>
        </Card>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Turn not found</AlertTitle>
          <AlertDescription>
            The requested turn could not be found for this run.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
