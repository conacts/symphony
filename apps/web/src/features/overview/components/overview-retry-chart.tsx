import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
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
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import type { RuntimeSummaryViewModel } from "@/features/overview/model/overview-view-model";

const retryChartConfig = {
  attempt: {
    label: "Retry attempt",
    color: "var(--chart-3)"
  }
} satisfies ChartConfig;

export function OverviewRetryChart(input: {
  rows: RuntimeSummaryViewModel["retryChartRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Retry attempt queue</CardTitle>
        <CardDescription>
          Current retry attempt depth for issues that are backing off.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No issues are waiting in the retry queue.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={retryChartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="issueIdentifier"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dashed" />}
              />
              <Bar dataKey="attempt" fill="var(--color-attempt)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
