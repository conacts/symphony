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
import { buildAgentRunViewModel } from "@/features/runs/model/agent-run-view-model";
import type { AgentRunResource } from "@/features/runs/hooks/use-agent-run";

export function RunTurnsView(input: {
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
          <AlertTitle>Run turns degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.resource?.agentError ? (
        <Alert>
          <AlertTitle>Agent transcript degraded</AlertTitle>
          <AlertDescription>{input.resource.agentError}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          <section className="flex flex-col gap-2">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {viewModel.runId} turns
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Turn-level drilldown for this run. Open an individual turn to inspect the prompt, transcript, tools, commands, and task state in isolation.
              </p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Turns"
              value={viewModel.metrics.find((metric) => metric.label === "Turns")?.value ?? "0"}
              detail={
                viewModel.metrics.find((metric) => metric.label === "Turns")?.detail ??
                "No turns were recorded."
              }
            />
            <MetricCard
              label="Tokens"
              value={viewModel.metrics.find((metric) => metric.label === "Tokens")?.value ?? "0"}
              detail={
                viewModel.metrics.find((metric) => metric.label === "Tokens")?.detail ??
                "No token usage was recorded."
              }
            />
            <MetricCard
              label="Workflow"
              value={viewModel.metrics.find((metric) => metric.label === "Workflow")?.value ?? "n/a"}
              detail={
                viewModel.metrics.find((metric) => metric.label === "Workflow")?.detail ??
                "Workflow state unavailable."
              }
            />
          </section>

          <section className="flex flex-col gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Turn table</h2>
              <p className="text-sm text-muted-foreground">
                Runs aggregate into turns here before you drill all the way down to item-level transcript detail.
              </p>
            </div>
            {viewModel.turnRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No turns were recorded for this run.
              </p>
            ) : (
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
            )}
          </section>
        </>
      ) : input.loading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Loading run turns…
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Run turns unavailable</CardTitle>
            <CardDescription>Unable to load this run.</CardDescription>
          </CardHeader>
        </Card>
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
