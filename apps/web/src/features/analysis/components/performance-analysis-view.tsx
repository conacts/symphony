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
import { PerformanceCommandFamilyChart } from "@/features/analysis/components/performance-command-family-chart";
import { PerformanceToolChart } from "@/features/analysis/components/performance-tool-chart";
import type { PerformanceAnalysisViewModel } from "@/features/analysis/model/performance-analysis-view-model";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function PerformanceAnalysisView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  performanceAnalysis: PerformanceAnalysisViewModel | null;
}) {
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
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Performance analysis</h1>
            <p className="text-sm text-muted-foreground">
              Cross-run command and tool performance patterns for deciding where orchestration improvements will reduce latency and flake.
            </p>
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Performance spotlight</CardTitle>
                <CardDescription>
                  The most actionable current command and tool performance signals.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Slowest command family</p>
                  <p className="mt-2 break-all text-xl font-semibold">
                    {input.performanceAnalysis.spotlight.slowestCommandFamily}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.performanceAnalysis.spotlight.slowestCommandFamilyDetail}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Flakiest command family</p>
                  <p className="mt-2 break-all text-xl font-semibold">
                    {input.performanceAnalysis.spotlight.flakiestCommandFamily}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.performanceAnalysis.spotlight.flakiestCommandFamilyDetail}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Slowest tool</p>
                  <p className="mt-2 break-all text-xl font-semibold">
                    {input.performanceAnalysis.spotlight.slowestTool}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.performanceAnalysis.spotlight.slowestToolDetail}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Flakiest tool</p>
                  <p className="mt-2 break-all text-xl font-semibold">
                    {input.performanceAnalysis.spotlight.flakiestTool}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.performanceAnalysis.spotlight.flakiestToolDetail}
                  </p>
                </div>
              </CardContent>
            </Card>

            <PerformanceCommandFamilyChart
              rows={input.performanceAnalysis.commandFamilyRows}
            />
            <PerformanceToolChart rows={input.performanceAnalysis.toolRows} />
          </section>

          <Card>
            <CardHeader>
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
                              className="underline-offset-4 hover:underline focus-visible:underline"
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
