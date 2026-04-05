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
import type { AgentRunViewModel } from "@/features/runs/model/agent-run-view-model";

export function RunTurnsCard(input: {
  title: string;
  description: string;
  rows: AgentRunViewModel["turnRows"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{input.title}</CardTitle>
        <CardDescription>{input.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Turn</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Ended</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Commands</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Reasoning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {input.rows.map((turn) => (
                <TableRow key={turn.turnId}>
                  <TableCell className="font-medium">
                    <Link
                      href={turn.href}
                      className="underline-offset-4 hover:underline focus-visible:underline"
                    >
                      Turn {turn.turnSequence}
                    </Link>
                  </TableCell>
                  <TableCell>{turn.startedAt}</TableCell>
                  <TableCell>{turn.endedAt}</TableCell>
                  <TableCell>{turn.status}</TableCell>
                  <TableCell>{turn.tokenSummary}</TableCell>
                  <TableCell>{turn.commandCount}</TableCell>
                  <TableCell>{turn.toolCount}</TableCell>
                  <TableCell>{turn.reasoningCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            No turns were recorded for this run.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
