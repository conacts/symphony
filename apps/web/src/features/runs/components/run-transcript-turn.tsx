"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Message,
  MessageContent,
  MessageResponse
} from "@/components/ai-elements/message";
import { RunTranscriptTurnEntry } from "@/features/runs/components/run-transcript-turn-entry";
import { buildTranscriptSections } from "@/features/runs/components/run-transcript-turn-sections";
import type {
  AgentRunTranscriptEntry,
  AgentRunTranscriptTurn
} from "@/features/runs/model/agent-run-transcript";

export function RunTranscriptTurn(input: {
  turn: AgentRunTranscriptTurn;
  onOpenOverflow: (entry: AgentRunTranscriptEntry) => void;
}) {
  const sections = buildTranscriptSections(input.turn.entries);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Operator prompt
        </p>
        <Message from="user">
          <MessageContent>
            <MessageResponse>{input.turn.promptText}</MessageResponse>
          </MessageContent>
        </Message>
      </div>

      {input.turn.activitySummary.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {input.turn.activitySummary.map((card) => (
            <Card key={card.label} className="border-border/70">
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                <p className="text-base font-semibold">{card.value}</p>
                <p className="text-sm text-muted-foreground">{card.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {input.turn.entries.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No runtime items were captured for this turn.
          </CardContent>
        </Card>
      ) : null}

      {sections.map((section) => (
        <div key={section.key} className="flex flex-col gap-4">
          {section.entries.map((entry) => (
            <RunTranscriptTurnEntry
              key={entry.itemId}
              entry={entry}
              onOpenOverflow={input.onOpenOverflow}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
