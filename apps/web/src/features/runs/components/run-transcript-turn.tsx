"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { ChevronDownIcon } from "lucide-react";
import { RunTranscriptTurnEntry } from "@/features/runs/components/run-transcript-turn-entry";
import { buildTranscriptSections } from "@/features/runs/components/run-transcript-turn-sections";
import type {
  AgentRunTranscriptEntry,
  AgentRunTranscriptTurn
} from "@/features/runs/model/agent-run-transcript";
import { Streamdown } from "streamdown";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";

const streamdownPlugins = { cjk, code, math, mermaid };

export function RunTranscriptTurn(input: {
  turn: AgentRunTranscriptTurn;
  onOpenOverflow: (entry: AgentRunTranscriptEntry) => void;
}) {
  const sections = buildTranscriptSections(input.turn.entries);

  return (
    <div className="flex flex-col gap-5">
      <Collapsible className="rounded-xl border border-border/70 overflow-hidden" defaultOpen={false}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
          >
            <div className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-[0.2em]">
                Operator prompt
              </p>
            </div>
            <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/60 px-4 py-4">
          <Streamdown className="p-4" plugins={streamdownPlugins}>{input.turn.promptText}</Streamdown>
        </CollapsibleContent>
      </Collapsible>

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
