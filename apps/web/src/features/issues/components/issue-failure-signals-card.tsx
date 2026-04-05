"use client";

import Link from "next/link";
import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

export type IssueFailureSignalRow = {
  runId: string;
  runHref: string;
  outcome: string;
  startedAt: string;
  errorClass: string;
  message: string;
};

export function IssueFailureSignalsCard(input: {
  rows: IssueFailureSignalRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent failure signals</CardTitle>
        <CardDescription>
          The local failure pattern for this issue before you drill into a specific run transcript.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No non-success runs have been recorded for this issue.
          </p>
        ) : (
          input.rows.map((row) => (
            <div key={row.runId} className="rounded-xl border border-border/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={row.runHref}
                  className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                >
                  {row.outcome}
                </Link>
                <p className="text-sm text-muted-foreground">{row.startedAt}</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{row.errorClass}</p>
              <p className="mt-2 text-sm">{row.message}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
