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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

export type IssueRunHistoryRow = {
  runId: string;
  runHref: string;
  startedAt: string;
  durationSeconds: string;
  totalTokens: string;
  turnsAndEvents: string;
  model: string;
  status: string;
  outcome: string;
};

export function IssueRunHistoryCard(input: {
  rows: IssueRunHistoryRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Run history</CardTitle>
        <CardDescription>
          Browse recorded attempts for this issue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recorded runs for this issue yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Total tokens</TableHead>
                <TableHead>Turns / events</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {input.rows.map((row) => (
                <TableRow key={row.runId}>
                  <TableCell className="font-medium">
                    <Link
                      href={row.runHref}
                      className="underline-offset-4 hover:underline focus-visible:underline"
                    >
                      {row.runId.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell>{row.startedAt}</TableCell>
                  <TableCell>{row.durationSeconds}</TableCell>
                  <TableCell>{row.totalTokens}</TableCell>
                  <TableCell>{row.turnsAndEvents}</TableCell>
                  <TableCell>{row.model}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.outcome}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
