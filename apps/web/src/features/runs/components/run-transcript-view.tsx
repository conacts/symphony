"use client";

import React from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { RunDebugPanel } from "@/features/runs/components/run-debug-panel";
import { RunContextBreadcrumb } from "@/features/runs/components/run-context-breadcrumb";
import { RunExecutionDurationChart } from "@/features/runs/components/run-execution-duration-chart";
import { RunTurnLatencyChart } from "@/features/runs/components/run-turn-latency-chart";
import { RunTurnTokenChart } from "@/features/runs/components/run-turn-token-chart";
import { buildAgentRunViewModel } from "@/features/runs/model/agent-run-view-model";
import type { AgentRunResource } from "@/features/runs/hooks/use-agent-run";

export function RunTranscriptView(input: {
  runtimeBaseUrl: string;
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
              <RunContextBreadcrumb
                issueIdentifier={viewModel.issueIdentifier}
                runId={viewModel.runId}
                current="run"
              />
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

          <Card>
            <CardHeader>
              <CardTitle>Turns</CardTitle>
              <CardDescription>
                Runs aggregate into turns here. Open an individual turn to inspect its full transcript, commands, tools, reasoning, and task updates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viewModel.turnRows.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Turn</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Ended</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Commands</TableHead>
                      <TableHead>Tools</TableHead>
                      <TableHead>Reasoning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewModel.turnRows.map((turn) => (
                      <TableRow key={turn.turnId}>
                        <TableCell className="font-medium">
                          <Link
                            href={turn.href}
                            className="underline-offset-4 hover:underline focus-visible:underline"
                          >
                            Turn {turn.turnSequence}
                          </Link>
                        </TableCell>
                        <TableCell>{turn.startedAt}</TableCell>
                        <TableCell>{turn.endedAt}</TableCell>
                        <TableCell>{turn.status}</TableCell>
                        <TableCell>{turn.tokenSummary}</TableCell>
                        <TableCell>{turn.commandCount}</TableCell>
                        <TableCell>{turn.toolCount}</TableCell>
                        <TableCell>{turn.reasoningCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No turns were recorded for this run.
                </p>
              )}
            </CardContent>
          </Card>

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
