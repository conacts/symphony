"use client";

import React, { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { fetchCodexOverflow } from "@/core/codex-analytics-client";
import { RunDebugPanel } from "@/features/runs/components/run-debug-panel";
import { RunOverflowSheet } from "@/features/runs/components/run-overflow-sheet";
import { RunTranscriptTurn } from "@/features/runs/components/run-transcript-turn";
import {
  buildCodexRunViewModel,
  formatOverflowContent,
  type CodexRunTranscriptEntry
} from "@/features/runs/model/codex-run-view-model";
import type { CodexRunResource } from "@/features/runs/hooks/use-codex-run";

type OverflowState = {
  title: string;
  description: string;
  content: string | null;
  loading: boolean;
  error: string | null;
};

const closedOverflowState: OverflowState = {
  title: "",
  description: "",
  content: null,
  loading: false,
  error: null
};

export function RunTranscriptView(input: {
  runtimeBaseUrl: string;
  error: string | null;
  loading: boolean;
  resource: CodexRunResource | null;
}) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowState, setOverflowState] = useState<OverflowState>(
    closedOverflowState
  );
  const viewModel = input.resource
    ? buildCodexRunViewModel({
        runDetail: input.resource.runDetail,
        runArtifacts: input.resource.runArtifacts
      })
    : null;

  const openOverflow = async (entry: CodexRunTranscriptEntry) => {
    if (!input.resource || !entry.overflowId) {
      return;
    }

    setOverflowOpen(true);
    setOverflowState({
      title: buildOverflowTitle(entry),
      description: `${entry.recordedAt} · ${entry.status}`,
      content: null,
      loading: true,
      error: null
    });

    try {
      const overflow = await fetchCodexOverflow(
        input.runtimeBaseUrl,
        input.resource.runDetail.run.runId,
        entry.overflowId
      );

      setOverflowState({
        title: buildOverflowTitle(entry),
        description: `${entry.recordedAt} · ${overflow.overflow.kind}`,
        content: formatOverflowContent(overflow),
        loading: false,
        error: null
      });
    } catch (error) {
      setOverflowState({
        title: buildOverflowTitle(entry),
        description: `${entry.recordedAt} · overflow`,
        content: null,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load the overflow payload."
      });
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Run transcript degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.resource?.codexError ? (
        <Alert>
          <AlertTitle>Codex transcript unavailable</AlertTitle>
          <AlertDescription>{input.resource.codexError}</AlertDescription>
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
              <p className="text-sm font-medium text-muted-foreground">
                {viewModel.issueIdentifier}
              </p>
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
              <CardTitle>Structured run conversation</CardTitle>
              <CardDescription>
                The run rendered as a chronological conversation between the operator prompt, Codex, commands, tools, and file changes.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-8">
              {viewModel.hasTranscript ? (
                viewModel.transcriptTurns.map((turn) => (
                  <RunTranscriptTurn
                    key={turn.turnId}
                    turn={turn}
                    onOpenOverflow={openOverflow}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Codex transcript items were captured for this run.
                </p>
              )}
            </CardContent>
          </Card>

          <section className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Execution performance
              </h2>
              <p className="text-sm text-muted-foreground">
                Local command and tool execution hotspots for this run before you read the full conversation.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {viewModel.executionPerformance.cards.map((card) => (
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
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle>Slow command executions</CardTitle>
                  <CardDescription>
                    The longest command steps captured in this run.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {viewModel.executionPerformance.commandRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No command executions were captured for this run.
                    </p>
                  ) : (
                    viewModel.executionPerformance.commandRows.map((row) => (
                      <div
                        key={`${row.label}:${row.duration}`}
                        className="rounded-xl border border-border/70 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-medium break-all">{row.label}</p>
                          <p className="text-sm text-muted-foreground">{row.duration}</p>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {row.family} · {row.status}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle>Slow tool calls</CardTitle>
                  <CardDescription>
                    The longest tool interactions captured in this run.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {viewModel.executionPerformance.toolRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tool calls were captured for this run.
                    </p>
                  ) : (
                    viewModel.executionPerformance.toolRows.map((row) => (
                      <div
                        key={`${row.label}:${row.duration}`}
                        className="rounded-xl border border-border/70 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-medium break-all">{row.label}</p>
                          <p className="text-sm text-muted-foreground">{row.duration}</p>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {row.status}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
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
                Repository snapshots and raw Codex events for deeper debugging.
              </p>
            </div>
            <RunDebugPanel viewModel={viewModel} />
          </section>
        </>
      ) : null}

      <RunOverflowSheet
        open={overflowOpen}
        onOpenChange={(open) => {
          setOverflowOpen(open);
          if (!open) {
            setOverflowState(closedOverflowState);
          }
        }}
        title={overflowState.title}
        description={overflowState.description}
        content={overflowState.content}
        loading={overflowState.loading}
        error={overflowState.error}
      />
    </div>
  );
}

function buildOverflowTitle(entry: CodexRunTranscriptEntry): string {
  switch (entry.kind) {
    case "agent-message":
      return "Assistant message";
    case "reasoning":
      return "Reasoning";
    case "command":
      return "Command output";
    case "tool-call":
      return "Tool result";
    case "generic":
      return entry.itemType;
  }
}
