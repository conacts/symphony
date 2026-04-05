"use client";

import React from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisFilterBar } from "@/features/analysis/components/analysis-filter-bar";
import { AnalysisPageHeader } from "@/features/analysis/components/analysis-page-header";
import { AnalysisPageNav } from "@/features/analysis/components/analysis-page-nav";
import { AnalysisSpotlightItem } from "@/features/analysis/components/analysis-spotlight-item";
import { PerformanceCommandFamilyChart } from "@/features/analysis/components/performance-command-family-chart";
import { PerformanceLatencyBreakdownChart } from "@/features/analysis/components/performance-latency-breakdown-chart";
import { PerformanceToolChart } from "@/features/analysis/components/performance-tool-chart";
import { PerformanceTurnLatencyChart } from "@/features/analysis/components/performance-turn-latency-chart";
import type { AnalysisQuery } from "@/features/analysis/model/analysis-query-state";
import type { AnalysisFilterOptions } from "@/features/analysis/model/analysis-sample-filter";
import type { PerformanceAnalysisViewModel } from "@/features/analysis/model/performance-analysis-view-model";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

const emptyAnalysisQuery: AnalysisQuery = {};
const emptyAnalysisFilterOptions: AnalysisFilterOptions = {
  harnesses: [],
  providers: [],
  models: []
};

export function PerformanceAnalysisView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  performanceAnalysis: PerformanceAnalysisViewModel | null;
  query?: AnalysisQuery;
  filterOptions?: AnalysisFilterOptions;
  sampledRunCount?: number;
  sampledIssueCount?: number;
  onQueryChange?(query: AnalysisQuery): void;
}) {
  const query = input.query ?? emptyAnalysisQuery;
  const filterOptions = input.filterOptions ?? emptyAnalysisFilterOptions;
  const sampledRunCount = input.sampledRunCount ?? 0;
  const sampledIssueCount = input.sampledIssueCount ?? 0;
  const onQueryChange = input.onQueryChange ?? (() => {});

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Performance analysis degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.performanceAnalysis ? (
        <>
          <AnalysisPageHeader
            eyebrow="Cross-run trends"
            title="Performance analysis"
            description="Cross-run command and tool performance patterns for deciding where orchestration improvements will reduce latency and flake."
            focus="Use this page to see which execution paths are slow, flaky, or shaping the latency profile of the current run sample."
          />
          <AnalysisPageNav />
          <AnalysisFilterBar
            query={query}
            options={filterOptions}
            sampledRunCount={sampledRunCount}
            sampledIssueCount={sampledIssueCount}
            onQueryChange={onQueryChange}
          />

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Execution pressure</h2>
              <p className="text-sm text-muted-foreground">
                Broad command and tool activity before you drill into the specific hotspots.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {input.performanceAnalysis.summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="space-y-1 pb-2">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="break-all text-2xl">{card.value}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {card.detail}
                </CardContent>
              </Card>
            ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Latency profile</h2>
              <p className="text-sm text-muted-foreground">
                The current wall-clock shape of turns, commands, and tool calls across the sampled runs.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {input.performanceAnalysis.latencyCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="space-y-1 pb-2">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="break-all text-2xl">{card.value}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {card.detail}
                </CardContent>
              </Card>
            ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Spotlight and hotspots</h2>
              <p className="text-sm text-muted-foreground">
                The single most actionable execution signals, followed by the families and tools that dominate the sample.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Performance spotlight</CardTitle>
                <CardDescription>
                  The most actionable current command and tool performance signals.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <AnalysisSpotlightItem
                  label="Slowest command family"
                  value={input.performanceAnalysis.spotlight.slowestCommandFamily}
                  detail={input.performanceAnalysis.spotlight.slowestCommandFamilyDetail}
                />
                <AnalysisSpotlightItem
                  label="Flakiest command family"
                  value={input.performanceAnalysis.spotlight.flakiestCommandFamily}
                  detail={input.performanceAnalysis.spotlight.flakiestCommandFamilyDetail}
                />
                <AnalysisSpotlightItem
                  label="Slowest tool"
                  value={input.performanceAnalysis.spotlight.slowestTool}
                  detail={input.performanceAnalysis.spotlight.slowestToolDetail}
                />
                <AnalysisSpotlightItem
                  label="Flakiest tool"
                  value={input.performanceAnalysis.spotlight.flakiestTool}
                  detail={input.performanceAnalysis.spotlight.flakiestToolDetail}
                />
                <AnalysisSpotlightItem
                  label="Slowest turn"
                  value={input.performanceAnalysis.spotlight.slowestTurn}
                  detail={input.performanceAnalysis.spotlight.slowestTurnDetail}
                  className="md:col-span-2"
                />
              </CardContent>
            </Card>

            <PerformanceCommandFamilyChart
              rows={input.performanceAnalysis.commandFamilyRows}
            />
            <PerformanceToolChart rows={input.performanceAnalysis.toolRows} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Latency composition</h2>
              <p className="text-sm text-muted-foreground">
                Where turn time is actually being spent, and which turns are setting the upper bound for operator wait time.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
            <PerformanceLatencyBreakdownChart
              rows={input.performanceAnalysis.latencyBreakdownRows}
            />
            <PerformanceTurnLatencyChart
              rows={input.performanceAnalysis.slowTurnRows}
            />
            </div>
          </section>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Execution hotspots</CardTitle>
              <CardDescription>
                The raw commands and tools currently driving the most latency or failure pressure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {input.performanceAnalysis.hotspotRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No execution hotspots are active in the current sample.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kind</TableHead>
                      <TableHead>Operation</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Samples</TableHead>
                      <TableHead>Failures</TableHead>
                      <TableHead>Average</TableHead>
                      <TableHead>Max</TableHead>
                      <TableHead>Last seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {input.performanceAnalysis.hotspotRows.map((row) => (
                      <TableRow key={`${row.kind}:${row.label}`}>
                        <TableCell>{row.kind}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-col gap-1">
                            <Link
                              href={row.runHref}
                              className="break-all underline-offset-4 hover:underline focus-visible:underline"
                            >
                              {row.label}
                            </Link>
                            <Link
                              href={row.issueHref}
                              className="text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
                            >
                              {row.issueHref.replace("/issues/", "")}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>{row.scope}</TableCell>
                        <TableCell>{row.sampleCount}</TableCell>
                        <TableCell>{row.failureCount}</TableCell>
                        <TableCell>{row.avgDuration}</TableCell>
                        <TableCell>{row.maxDuration}</TableCell>
                        <TableCell>{row.lastSeen}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : input.loading ? (
        <section className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-44" />
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Performance analysis unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
