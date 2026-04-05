"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisFilterBar } from "@/features/analysis/components/analysis-filter-bar";
import { AnalysisPageHeader } from "@/features/analysis/components/analysis-page-header";
import { AnalysisPageNav } from "@/features/analysis/components/analysis-page-nav";
import { AnalysisSpotlightItem } from "@/features/analysis/components/analysis-spotlight-item";
import type { AnalysisQuery } from "@/features/analysis/model/analysis-query-state";
import type { AnalysisFilterOptions } from "@/features/analysis/model/analysis-sample-filter";
import type { AnalysisOverviewViewModel } from "@/features/analysis/model/analysis-overview-view-model";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

const emptyAnalysisQuery: AnalysisQuery = {};
const emptyAnalysisFilterOptions: AnalysisFilterOptions = {
  harnesses: [],
  providers: [],
  models: []
};

export function AnalysisOverviewView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  overview: AnalysisOverviewViewModel | null;
  query?: AnalysisQuery;
  filterOptions?: AnalysisFilterOptions;
  sampledRunCount?: number;
  sampledIssueCount?: number;
  onQueryChange?(query: AnalysisQuery): void;
}) {
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const query = input.query ?? emptyAnalysisQuery;
  const filterOptions = input.filterOptions ?? emptyAnalysisFilterOptions;
  const sampledRunCount = input.sampledRunCount ?? 0;
  const sampledIssueCount = input.sampledIssueCount ?? 0;
  const onQueryChange = input.onQueryChange ?? (() => {});

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Analysis overview degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.overview ? (
        <>
          <AnalysisPageHeader
            eyebrow="Cross-run trends"
            title="Analysis overview"
            description="Operator analysis surfaces for failures, performance, and token pressure across recent work."
            focus="Start here to decide which investigation path matters most, then drill into the dedicated page for that dimension."
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
              <h2 className="text-lg font-semibold tracking-tight">
                Investigation tracks
              </h2>
              <p className="text-sm text-muted-foreground">
                Each page answers a different cross-run question. Use the strongest current signal to choose your next drilldown.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              {input.overview.cards.map((card) => (
                <Card key={card.href}>
                  <CardHeader className="pb-4">
                    <CardTitle>{card.title}</CardTitle>
                    <CardDescription>{card.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <AnalysisSpotlightItem
                      label={card.primaryLabel}
                      value={card.primaryValue}
                      detail={card.primaryDetail}
                    />
                    <AnalysisSpotlightItem
                      label={card.secondaryLabel}
                      value={card.secondaryValue}
                      detail={card.secondaryDetail}
                    />
                    <Link
                      href={search ? `${card.href}?${search}` : card.href}
                      className="text-sm font-medium text-foreground underline underline-offset-4"
                    >
                      Open {card.title.toLowerCase()}
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
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
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Analysis overview unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
