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
          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {viewModel.issueIdentifier}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {viewModel.runTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              {viewModel.statusSummary}
            </p>
            {viewModel.failureSummary ? (
              <p className="text-sm text-destructive">{viewModel.failureSummary}</p>
            ) : null}
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {viewModel.metrics.map((metric) => (
              <Card key={metric.label}>
                <CardHeader>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="text-2xl">{metric.value}</CardTitle>
                </CardHeader>
                {metric.detail ? (
                  <CardContent className="pt-0 text-sm text-muted-foreground">
                    {metric.detail}
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {viewModel.metadata.map((row) => (
              <Card key={row.label}>
                <CardHeader className="space-y-1 pb-2">
                  <CardDescription>{row.label}</CardDescription>
                  <CardTitle className="text-lg">{row.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Structured run conversation</CardTitle>
              <CardDescription>
                Codex turns, assistant messages, commands, tools, reasoning, and file changes in chronological order.
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
