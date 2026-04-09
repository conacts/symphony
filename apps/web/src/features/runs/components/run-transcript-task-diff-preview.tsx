"use client";

import React from "react";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/core/display-formatters";

const DIFF_PREVIEW_LINE_COUNT = 8;

export function RunTranscriptTaskDiffPreview(input: {
  diffText: string;
}) {
  const [showFullDiff, setShowFullDiff] = React.useState(false);
  const formattedDiff = React.useMemo(
    () => formatDiffForDisplay(input.diffText),
    [input.diffText]
  );
  const lines = React.useMemo(() => formattedDiff.split("\n"), [formattedDiff]);
  const hasOverflow = lines.length > DIFF_PREVIEW_LINE_COUNT;
  const visibleDiff =
    hasOverflow && !showFullDiff
      ? lines.slice(0, DIFF_PREVIEW_LINE_COUNT).join("\n")
      : formattedDiff;

  return (
    <div className="pt-1">
      <CodeBlock code={visibleDiff} language="diff" />
      {hasOverflow ? (
        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowFullDiff((value) => !value)}
          >
            {showFullDiff
              ? "Show diff preview"
              : `Show full diff (${formatCount(lines.length)} lines)`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function formatDiffForDisplay(diffText: string): string {
  const normalized = diffText
    .replace(/\r\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n");

  if (normalized.includes("\n")) {
    return normalized;
  }

  return normalized
    .replace(/\s+(?=(?:diff --git|index |--- |\+\+\+ |@@ ))/g, "\n")
    .replace(/(@@[^@\n]*@@)\s+/g, "$1\n")
    .replace(/\s(?=[+-][^\s])/g, "\n");
}
