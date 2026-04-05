"use client";

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { RunContextBreadcrumb } from "@/features/runs/components/run-context-breadcrumb";
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
          <section className="flex flex-col gap-2">
            <RunContextBreadcrumb
              issueIdentifier={viewModel.issueIdentifier}
              runId={viewModel.runId}
              current="turn"
              turnLabel={`Turn ${turn.turnSequence}`}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                  Turn {turn.turnSequence}
                </h1>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  Single-turn drilldown across prompt, transcript, tools, commands, and task state.
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Status"
              value={turn.status}
              detail={`${turn.startedAt} → ${turn.endedAt}`}
            />
            <MetricCard
              label="Tokens"
              value={turn.tokenSummary}
              detail="Token usage recorded for this turn."
            />
            <MetricCard
              label="Activity"
              value={turn.countsSummary}
              detail={turn.promptText}
            />
          </section>

          <section className="flex flex-col gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Turn transcript</h2>
              <p className="text-sm text-muted-foreground">
                The full transcript for this turn, including reasoning, commands, tools, tasks, and assistant output.
              </p>
            </div>
            <RunTranscriptTurn turn={turn} onOpenOverflow={input.onOpenOverflow} />
          </section>
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

function MetricCard(input: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardDescription>{input.label}</CardDescription>
        <CardTitle className="text-2xl">{input.value}</CardTitle>
        <CardDescription>{input.detail}</CardDescription>
      </CardHeader>
    </Card>
  );
}
