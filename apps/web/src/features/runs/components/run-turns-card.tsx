"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { formatCount } from "@/core/display-formatters";
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

type TurnSortKey = "startedAt" | "endedAt" | "totalTokens";
type SortDirection = "asc" | "desc";

export function RunTurnsCard(input: {
  title: string;
  description: string;
  rows: AgentRunViewModel["turnRows"];
}) {
  const [sortState, setSortState] = useState<{
    key: TurnSortKey;
    direction: SortDirection;
  }>({
    key: "startedAt",
    direction: "desc"
  });

  const sortedRows = useMemo(
    () =>
      [...input.rows].sort((left, right) => {
        const comparison = compareRows(left, right, sortState.key);

        return sortState.direction === "desc" ? -comparison : comparison;
      }),
    [input.rows, sortState.direction, sortState.key]
  );

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
                <SortableHead
                  label="Started"
                  active={sortState.key === "startedAt"}
                  direction={sortState.key === "startedAt" ? sortState.direction : null}
                  onClick={() => {
                    setSortState((current) =>
                      current.key === "startedAt"
                        ? {
                            key: "startedAt",
                            direction: current.direction === "desc" ? "asc" : "desc"
                          }
                        : { key: "startedAt", direction: "desc" }
                    );
                  }}
                />
                <SortableHead
                  label="Ended"
                  active={sortState.key === "endedAt"}
                  direction={sortState.key === "endedAt" ? sortState.direction : null}
                  onClick={() => {
                    setSortState((current) =>
                      current.key === "endedAt"
                        ? {
                            key: "endedAt",
                            direction: current.direction === "desc" ? "asc" : "desc"
                          }
                        : { key: "endedAt", direction: "desc" }
                    );
                  }}
                />
                <TableHead>Status</TableHead>
                <SortableHead
                  label="Total tokens"
                  active={sortState.key === "totalTokens"}
                  direction={sortState.key === "totalTokens" ? sortState.direction : null}
                  onClick={() => {
                    setSortState((current) =>
                      current.key === "totalTokens"
                        ? {
                            key: "totalTokens",
                            direction: current.direction === "desc" ? "asc" : "desc"
                          }
                        : { key: "totalTokens", direction: "desc" }
                    );
                  }}
                />
                <TableHead>Commands</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Reasoning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((turn) => (
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
                  <TableCell>{formatCount(turn.totalTokens)}</TableCell>
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

function SortableHead(input: {
  label: string;
  active: boolean;
  direction: SortDirection | null;
  onClick: () => void;
}) {
  return (
    <TableHead aria-sort={input.active ? (input.direction === "desc" ? "descending" : "ascending") : undefined}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-left font-medium transition-colors hover:text-foreground"
        aria-label={
          input.active
            ? `Sort by ${input.label.toLowerCase()} ${input.direction === "desc" ? "ascending" : "descending"}`
            : `Sort by ${input.label.toLowerCase()}`
        }
        onClick={input.onClick}
      >
        {input.label}
        {input.active ? (
          input.direction === "desc" ? (
            <ArrowDownIcon className="size-3.5 text-muted-foreground" />
          ) : (
            <ArrowUpIcon className="size-3.5 text-muted-foreground" />
          )
        ) : null}
      </button>
    </TableHead>
  );
}

function compareRows(
  left: AgentRunViewModel["turnRows"][number],
  right: AgentRunViewModel["turnRows"][number],
  key: TurnSortKey
): number {
  switch (key) {
    case "startedAt":
      return compareTimestamps(left.startedAtIso, right.startedAtIso) || left.turnSequence - right.turnSequence;
    case "endedAt":
      return compareTimestamps(left.endedAtIso, right.endedAtIso) || left.turnSequence - right.turnSequence;
    case "totalTokens":
      return left.totalTokens - right.totalTokens || left.turnSequence - right.turnSequence;
  }
}

function compareTimestamps(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}
