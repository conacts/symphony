"use client";

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TokenIssueChart } from "@/features/analysis/components/token-issue-chart";
import { TokenTimeSeriesChart } from "@/features/analysis/components/token-time-series-chart";
import type { TokenAnalysisTimeRange } from "@/features/analysis/model/token-analysis-query-state";
import type { TokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function TokenAnalysisView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  tokenAnalysis: TokenAnalysisViewModel | null;
  selectedModel?: string;
  modelOptions?: Array<{
    value: string;
    label: string;
  }>;
  timeRange: TokenAnalysisTimeRange;
  onModelChange(model: string | undefined): void;
  onTimeRangeChange(timeRange: TokenAnalysisTimeRange): void;
}) {
  const modelOptions = input.modelOptions ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Token analysis degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.tokenAnalysis ? (
        <>
          <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Token analysis</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Token load by day, concentrated into a compact weekly or monthly view.
                Use the model filter to isolate a single model and keep the chart dense.
              </p>
            </div>

            <div className="flex flex-col gap-2 lg:items-end">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {input.tokenAnalysis.summaryCards[0]?.value ?? "n/a"} total tokens
                </Badge>
                <Badge variant="secondary">
                  {input.tokenAnalysis.summaryCards[1]?.value ?? "0"} runs
                </Badge>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={input.selectedModel ?? "__all_models__"}
                  onValueChange={(value) => {
                    input.onModelChange(
                      value === "__all_models__" ? undefined : value
                    );
                  }}
                >
                  <SelectTrigger className="w-full sm:w-64" size="sm" aria-label="Model filter">
                    <SelectValue placeholder="All models" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="__all_models__">All models</SelectItem>
                    {modelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={input.timeRange}
                  onValueChange={(value) => {
                    if (value) {
                      input.onTimeRangeChange(value as TokenAnalysisTimeRange);
                    }
                  }}
                  aria-label="Token analysis time range"
                >
                  {tokenTimeRangeOptions.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>
          </section>

          <section>
            <TokenTimeSeriesChart rows={input.tokenAnalysis.timeSeriesRows} />
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {input.tokenAnalysis.summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="space-y-1 pb-2">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-2xl">{card.value}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  {card.detail}
                </CardContent>
              </Card>
            ))}
          </section>

          <section>
            <TokenIssueChart rows={input.tokenAnalysis.issueTokenRows} />
          </section>
        </>
      ) : input.loading ? (
        <section className="grid gap-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-80 w-full" />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Card key={index}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-40" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Token analysis unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

const tokenTimeRangeOptions = [
  { value: "7d", label: "Week" },
  { value: "30d", label: "Month" },
  { value: "all", label: "All" }
] as const satisfies ReadonlyArray<{
  value: TokenAnalysisTimeRange;
  label: string;
}>;
