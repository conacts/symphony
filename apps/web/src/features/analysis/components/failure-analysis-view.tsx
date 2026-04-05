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
import type { AnalysisQuery } from "@/features/analysis/model/analysis-query-state";
import type { AnalysisFilterOptions } from "@/features/analysis/model/analysis-sample-filter";
import { FailureErrorClassChart } from "@/features/analysis/components/failure-error-class-chart";
import { FailureModeChart } from "@/features/analysis/components/failure-mode-chart";
import type { FailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

const emptyAnalysisQuery: AnalysisQuery = {};
const emptyAnalysisFilterOptions: AnalysisFilterOptions = {
  harnesses: [],
  providers: [],
  models: []
};

export function FailureAnalysisView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  failureAnalysis: FailureAnalysisViewModel | null;
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
          <AlertTitle>Failure analysis degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.failureAnalysis ? (
        <>
          <AnalysisPageHeader
            eyebrow="Cross-run trends"
            title="Failure analysis"
            description="Cross-run failure patterns for deciding where orchestration improvements will matter most."
            focus="Use this page to identify which failure modes and error classes are currently creating the heaviest operator drag."
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
              <h2 className="text-lg font-semibold tracking-tight">Failure coverage</h2>
              <p className="text-sm text-muted-foreground">
                High-level pressure across the current issue set before you drill into specific patterns.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Spotlight and composition</h2>
              <p className="text-sm text-muted-foreground">
                The strongest failure signals first, then the charts that show how widely they are spreading.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Current failure landscape</CardTitle>
                <CardDescription>
                  The strongest failure signals in the current issue set.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <AnalysisSpotlightItem
                  label="Dominant failure mode"
                  value={input.failureAnalysis.spotlight.dominantFailureMode}
                  detail={input.failureAnalysis.spotlight.dominantFailureModeDetail}
                />
                <AnalysisSpotlightItem
                  label="Dominant error class"
                  value={input.failureAnalysis.spotlight.dominantErrorClass}
                  detail={input.failureAnalysis.spotlight.dominantErrorClassDetail}
                />
              </CardContent>
            </Card>

            <FailureModeChart rows={input.failureAnalysis.failureModeRows} />
            <FailureErrorClassChart rows={input.failureAnalysis.errorClassRows} />
            </div>
          </section>

          <Card>
            <CardHeader className="pb-4">
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
                        <TableCell className="max-w-sm text-sm text-muted-foreground">
                          {row.latestErrorMessage}
                        </TableCell>
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
