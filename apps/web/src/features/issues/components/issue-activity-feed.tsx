"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

export function IssueActivityFeed(input: {
  rows: Array<{
    entryId: string;
    recordedAt: string;
    source: string;
    eventType: string;
    runId: string;
    message: string;
    detail: string;
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chronological event feed</CardTitle>
        <CardDescription>
          Unified issue activity rendered as a readable feed instead of a split debug table.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity has been recorded for this issue yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {input.rows.map((row) => (
              <article
                key={row.entryId}
                className="flex flex-col gap-3 rounded-xl border border-border/70 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{row.source}</Badge>
                  <Badge variant="outline">{row.eventType}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {row.recordedAt}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">
                    {row.message}
                  </p>
                  <p className="text-xs text-muted-foreground">Run {row.runId}</p>
                </div>

                <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                  {row.detail}
                </pre>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
