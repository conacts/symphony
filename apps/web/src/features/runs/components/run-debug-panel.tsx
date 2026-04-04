"use client";

import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import type { CodexRunViewModel } from "@/features/runs/model/codex-run-view-model";

export function RunDebugPanel(input: {
  viewModel: CodexRunViewModel;
}) {
  return (
    <Accordion type="multiple" className="w-full space-y-4">
      <AccordionItem value="repo-start" className="rounded-lg border px-4">
        <AccordionTrigger>Repo start snapshot</AccordionTrigger>
        <AccordionContent>
          <pre className="overflow-x-auto rounded-md border border-border/70 bg-muted/40 p-3 text-xs">
            {input.viewModel.repoStartText}
          </pre>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="repo-end" className="rounded-lg border px-4">
        <AccordionTrigger>Repo end snapshot</AccordionTrigger>
        <AccordionContent>
          <pre className="overflow-x-auto rounded-md border border-border/70 bg-muted/40 p-3 text-xs">
            {input.viewModel.repoEndText}
          </pre>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="events" className="rounded-lg border px-4">
        <AccordionTrigger>Raw Codex events</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-4">
            {input.viewModel.debugEvents.map((event) => (
              <div key={event.eventId} className="flex flex-col gap-2">
                <div className="text-xs text-muted-foreground">
                  {event.recordedAt} · {event.eventType} · {event.itemId}
                </div>
                <pre className="overflow-x-auto rounded-md border border-border/70 bg-muted/40 p-3 text-xs">
                  {event.payloadText}
                </pre>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
