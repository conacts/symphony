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
import { RunDebugPanel } from "@/features/runs/components/run-debug-panel";
import { RunExecutionDurationChart } from "@/features/runs/components/run-execution-duration-chart";
import { RunTurnLatencyChart } from "@/features/runs/components/run-turn-latency-chart";
import { RunTurnTokenChart } from "@/features/runs/components/run-turn-token-chart";
import { RunTurnsCard } from "@/features/runs/components/run-turns-card";
import { buildAgentRunViewModel } from "@/features/runs/model/agent-run-view-model";
import type { AgentRunResource } from "@/features/runs/hooks/use-agent-run";

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
