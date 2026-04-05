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
import { Skeleton } from "@/components/ui/skeleton";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import type { SymphonyForensicsIssueDetailResult } from "@symphony/contracts";
import { buildIssueTimelineHref } from "@/core/control-plane-routes";
import { IssueFailureSignalsCard } from "@/features/issues/components/issue-failure-signals-card";
import { IssueRunHistoryCard } from "@/features/issues/components/issue-run-history-card";
import { IssueRunTokenChart } from "@/features/issues/components/issue-run-token-chart";
import { buildIssueDetailViewModel } from "@/features/issues/model/issue-view-model";

export function IssueDetailView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  issueDetail: SymphonyForensicsIssueDetailResult | null;
  loading: boolean;
  issueIdentifier: string;
}) {
  const viewModel = input.issueDetail
    ? buildIssueDetailViewModel(input.issueDetail)
    : null;

  return (
    <div className="flex flex-col gap-8">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Issue detail degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          <section className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Issue runs</h1>
            <p className="text-sm text-muted-foreground">
              Run history is the primary surface here. Timeline and runtime debugging move to the dedicated activity page.
            </p>
          </section>

          <section className="grid gap-5 md:grid-cols-3">
            {viewModel.metrics.map((metric) => (
              <Card key={metric.label}>
                <CardHeader>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="break-all text-3xl">{metric.value}</CardTitle>
                  {metric.detail ? (
                    <CardDescription>{metric.detail}</CardDescription>
                  ) : null}
                </CardHeader>
              </Card>
            ))}
          </section>

          <IssueRunHistoryCard rows={viewModel.rows} />

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {viewModel.machineLoadCards.map((card) => (
              <Card key={card.label}>
                <CardHeader>
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="break-all text-2xl">{card.value}</CardTitle>
                  <CardDescription>{card.detail}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </section>

          <section>
            <IssueRunTokenChart rows={viewModel.tokenChartRows} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <section className="grid gap-4 md:grid-cols-3">
              {viewModel.tokenCards.map((card) => (
                <Card key={card.label}>
                  <CardHeader>
                    <CardDescription>{card.label}</CardDescription>
                    <CardTitle className="break-all text-2xl">{card.value}</CardTitle>
                    <CardDescription>{card.detail}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              {viewModel.failureCards.map((card) => (
                <Card key={card.label}>
                  <CardHeader>
                    <CardDescription>{card.label}</CardDescription>
                    <CardTitle className="break-all text-2xl">{card.value}</CardTitle>
                    <CardDescription>{card.detail}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </section>

            <IssueFailureSignalsCard rows={viewModel.recentFailureRows} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Issue activity</CardTitle>
              <CardDescription>
                Tracker events, runtime logs, and deep debugging now live on a separate page so this screen can stay focused on run history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={buildIssueTimelineHref(input.issueIdentifier)}
                className="text-sm font-medium text-foreground underline underline-offset-4"
              >
                Open issue activity
              </Link>
            </CardContent>
          </Card>

        </>
      ) : input.loading ? (
        <section className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
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
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Issue detail unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
