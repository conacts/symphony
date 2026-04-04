"use client";

import React, { Fragment } from "react";
import {
  Message,
  MessageContent
} from "@/components/ai-elements/message";
import { RunTranscriptCopy } from "@/components/run-transcript-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  CodexRunTranscriptEntry,
  CodexRunTranscriptTurn
} from "@/core/codex-run-view-model";

export function RunTranscriptTurn(input: {
  turn: CodexRunTranscriptTurn;
  onOpenOverflow: (entry: CodexRunTranscriptEntry) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">
            Turn {input.turn.turnSequence}
          </h2>
          <Badge variant="outline">{input.turn.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {input.turn.startedAt} → {input.turn.endedAt}
        </p>
        <p className="text-sm text-muted-foreground">{input.turn.tokenSummary}</p>
        <p className="text-sm text-muted-foreground">{input.turn.countsSummary}</p>
      </div>

      <Message from="user">
        <MessageContent>
          <RunTranscriptCopy>{input.turn.promptText}</RunTranscriptCopy>
        </MessageContent>
      </Message>

      {input.turn.entries.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No Codex items were captured for this turn.
          </CardContent>
        </Card>
      ) : null}

      {input.turn.entries.map((entry) => (
        <Fragment key={entry.itemId}>
          {entry.kind === "agent-message" ? (
            <Message from="assistant">
              <MessageContent className="gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{entry.recordedAt}</span>
                  <span>{entry.status}</span>
                </div>
                <RunTranscriptCopy>{entry.text ?? entry.preview}</RunTranscriptCopy>
                <EntryFiles files={entry.files} />
                {entry.overflowId ? (
                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => input.onOpenOverflow(entry)}
                    >
                      View full message
                    </Button>
                  </div>
                ) : null}
              </MessageContent>
            </Message>
          ) : null}

          {entry.kind === "reasoning" ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-sm font-medium">Reasoning</CardTitle>
                  <Badge variant="outline">{entry.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {entry.recordedAt}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <RunTranscriptCopy>{entry.text ?? entry.preview}</RunTranscriptCopy>
                {entry.overflowId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => input.onOpenOverflow(entry)}
                  >
                    View full reasoning
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {entry.kind === "command" ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-sm font-medium">Command</CardTitle>
                  <Badge variant="outline">{entry.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {entry.recordedAt}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="overflow-x-auto rounded-md border border-border/70 bg-muted/40 p-3 text-xs">
                  <code>{entry.command}</code>
                </pre>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{entry.duration}</span>
                  <span>exit {entry.exitCode ?? "n/a"}</span>
                </div>
                <RunTranscriptCopy>{entry.outputPreview}</RunTranscriptCopy>
                <EntryFiles files={entry.files} />
                {entry.overflowId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => input.onOpenOverflow(entry)}
                  >
                    View full command output
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {entry.kind === "tool-call" ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-sm font-medium">
                    Tool call
                  </CardTitle>
                  <Badge variant="outline">{entry.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {entry.recordedAt}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{entry.server}</span>
                  <span className="text-muted-foreground">/</span>
                  <span>{entry.tool}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{entry.duration}</span>
                  {entry.errorMessage ? <span>{entry.errorMessage}</span> : null}
                </div>
                <pre className="overflow-x-auto rounded-md border border-border/70 bg-muted/40 p-3 text-xs">
                  <code>{entry.argumentsText}</code>
                </pre>
                <RunTranscriptCopy>{entry.resultPreview}</RunTranscriptCopy>
                <EntryFiles files={entry.files} />
                {entry.overflowId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => input.onOpenOverflow(entry)}
                  >
                    View full tool result
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {entry.kind === "generic" ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-sm font-medium">
                    {entry.itemType}
                  </CardTitle>
                  <Badge variant="outline">{entry.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {entry.recordedAt}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <RunTranscriptCopy>{entry.preview}</RunTranscriptCopy>
                <EntryFiles files={entry.files} />
                {entry.overflowId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => input.onOpenOverflow(entry)}
                  >
                    View full payload
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </Fragment>
      ))}

      <Separator />
    </section>
  );
}

function EntryFiles(input: {
  files: Array<{
    path: string;
    changeKind: string;
  }>;
}) {
  if (input.files.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">Files</p>
      <div className="flex flex-wrap gap-2">
        {input.files.map((file) => (
          <Badge key={`${file.path}:${file.changeKind}`} variant="secondary">
            {file.changeKind} · {file.path}
          </Badge>
        ))}
      </div>
    </div>
  );
}
