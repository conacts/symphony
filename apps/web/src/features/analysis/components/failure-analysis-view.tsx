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
import { FailureErrorClassChart } from "@/features/analysis/components/failure-error-class-chart";
import { FailureModeChart } from "@/features/analysis/components/failure-mode-chart";
import type { FailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function FailureAnalysisView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  failureAnalysis: FailureAnalysisViewModel | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Failure analysis degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.failureAnalysis ? (
        <>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Failure analysis</h1>
            <p className="text-sm text-muted-foreground">
              Cross-run failure patterns for deciding where orchestration improvements will matter most.
            </p>
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {input.failureAnalysis.summaryCards.map((card) => (
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
                <CardTitle>Current failure landscape</CardTitle>
                <CardDescription>
                  The strongest failure signals in the current issue set.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-sm text-muted-foreground">Dominant failure mode</p>
                    <p className="mt-2 break-all text-xl font-semibold">
                      {input.failureAnalysis.spotlight.dominantFailureMode}
                    </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.failureAnalysis.spotlight.dominantFailureModeDetail}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-sm text-muted-foreground">Dominant error class</p>
                    <p className="mt-2 break-all text-xl font-semibold">
                      {input.failureAnalysis.spotlight.dominantErrorClass}
                    </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.failureAnalysis.spotlight.dominantErrorClassDetail}
                  </p>
                </div>
              </CardContent>
            </Card>

            <FailureModeChart rows={input.failureAnalysis.failureModeRows} />
            <FailureErrorClassChart rows={input.failureAnalysis.errorClassRows} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Failure hotspots</CardTitle>
              <CardDescription>
                The issues currently carrying the heaviest failure load.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {input.failureAnalysis.hotspotRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No current failure hotspots are active.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Current mode</TableHead>
                      <TableHead>Error class</TableHead>
                      <TableHead>Problem runs</TableHead>
                      <TableHead>Retries</TableHead>
                      <TableHead>Last active</TableHead>
                      <TableHead>Latest signal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {input.failureAnalysis.hotspotRows.map((row) => (
                      <TableRow key={row.issueIdentifier}>
                        <TableCell className="font-medium">
                          <Link
                            href={row.issueHref}
                            className="underline-offset-4 hover:underline focus-visible:underline"
                          >
                            {row.issueIdentifier}
                          </Link>
                        </TableCell>
                        <TableCell>{row.latestProblemOutcome}</TableCell>
                        <TableCell>{row.latestErrorClass}</TableCell>
                        <TableCell>{row.problemRuns}</TableCell>
                        <TableCell>{row.retries}</TableCell>
                        <TableCell>{row.lastActive}</TableCell>
                        <TableCell>{row.latestErrorMessage}</TableCell>
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
            <CardTitle>Failure analysis unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
