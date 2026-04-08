"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig
} from "@/components/ui/chart";
import { formatCount } from "@/core/display-formatters";
import { cn } from "@/lib/utils";
import type { AgentRunTranscriptTurn } from "@/features/runs/model/agent-run-transcript";

const chartConfig = {
  count: {
    label: "Calls",
    color: "var(--chart-4)"
  }
} satisfies ChartConfig;

export function RunTurnToolCallsChart(input: {
  turn: AgentRunTranscriptTurn;
  className?: string;
}) {
  const rows = buildTurnCallRows(input.turn.entries);

  return (
    <Card className={cn("border-border/70", input.className)}>
      <CardHeader className="space-y-1">
        <CardTitle>Tool calls made</CardTitle>
        <CardDescription>
          Commands and tool calls captured inside this turn.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No command or tool-call activity was captured for this turn.
          </p>
        ) : (
          <ChartContainer className="h-96 w-full" config={chartConfig}>
            <BarChart
              accessibilityLayer
              data={rows}
              layout="vertical"
              margin={{ left: 12, right: 24, top: 4, bottom: 4 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                dataKey="displayLabel"
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={220}
              />
              <ChartTooltip cursor={false} content={<RunTurnToolCallsTooltip />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={4}>
                <LabelList
                  dataKey="count"
                  position="right"
                  formatter={(value) => formatCount(Number(value ?? 0))}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

type ToolCallRow = {
  label: string;
  displayLabel: string;
  kind: "command" | "tool-call";
  count: number;
};

function buildTurnCallRows(turnEntries: AgentRunTranscriptTurn["entries"]): ToolCallRow[] {
  const rows = new Map<string, ToolCallRow>();

  for (const entry of turnEntries) {
    if (entry.kind !== "command" && entry.kind !== "tool-call") {
      continue;
    }

    const label =
      entry.kind === "command" ? entry.command : `${entry.server}.${entry.tool}`;
    const key = `${entry.kind}:${label}`;
    const existing = rows.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    rows.set(key, {
      label,
      displayLabel: truncateLabel(label),
      kind: entry.kind,
      count: 1
    });
  }

  return [...rows.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

function RunTurnToolCallsTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: ToolCallRow;
  }>;
}) {
  const row = input.payload?.[0]?.payload;

  if (!input.active || !row) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl"
      )}
    >
      <div className="font-medium">{row.label}</div>
      <TooltipStat label="Kind" value={row.kind === "command" ? "Command" : "Tool call"} />
      <TooltipStat label="Count" value={formatCount(row.count)} />
    </div>
  );
}

function TooltipStat(input: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{input.label}</span>
      <span className="font-mono font-medium tabular-nums">{input.value}</span>
    </div>
  );
}

function truncateLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= 44) {
    return normalized;
  }

  return `${normalized.slice(0, 41)}...`;
}
