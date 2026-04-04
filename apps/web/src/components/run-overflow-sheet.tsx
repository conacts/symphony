"use client";

import React from "react";
import { RunTranscriptCopy } from "@/components/run-transcript-copy";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";

export function RunOverflowSheet(input: {
  content: string | null;
  error: string | null;
  loading: boolean;
  open: boolean;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={input.open} onOpenChange={input.onOpenChange}>
      <SheetContent side="right" className="w-full max-w-3xl">
        <SheetHeader>
          <SheetTitle>{input.title}</SheetTitle>
          <SheetDescription>{input.description}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {input.loading ? (
            <p className="text-sm text-muted-foreground">Loading overflow payload…</p>
          ) : null}
          {input.error ? (
            <p className="text-sm text-destructive">{input.error}</p>
          ) : null}
          {input.content ? (
            <div className="rounded-lg border border-border/70 bg-background p-4">
              <RunTranscriptCopy>{input.content}</RunTranscriptCopy>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
