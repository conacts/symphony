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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import type { SymphonyForensicsIssueDetailResult } from "@symphony/contracts";
import { IssueRunOutcomeChart } from "@/features/issues/components/issue-run-outcome-chart";
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
            <p className="text-sm font-medium text-muted-foreground">
              {input.issueIdentifier}
            </p>
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

          <section className="grid gap-6 xl:grid-cols-2">
            <IssueRunOutcomeChart rows={viewModel.outcomeChartRows} />
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

            <Card>
              <CardHeader>
                <CardTitle>Recent failure signals</CardTitle>
                <CardDescription>
                  The local failure pattern for this issue before you drill into a specific run transcript.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {viewModel.recentFailureRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No non-success runs have been recorded for this issue.
                  </p>
                ) : (
                  viewModel.recentFailureRows.map((row) => (
                    <div
                      key={row.runId}
                      className="rounded-xl border border-border/70 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Link
                          href={row.runHref}
                          className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                        >
                          {row.outcome}
                        </Link>
                        <p className="text-sm text-muted-foreground">{row.startedAt}</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {row.errorClass}
                      </p>
                      <p className="mt-2 text-sm">{row.message}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
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
                href={`/issues/${input.issueIdentifier}/timeline`}
                className="text-sm font-medium text-foreground underline underline-offset-4"
              >
                Open issue activity
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run history</CardTitle>
              <CardDescription>
                Browse recorded attempts for this issue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viewModel.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recorded runs for this issue yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Total tokens</TableHead>
                      <TableHead>Turns / events</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewModel.rows.map((row) => (
                      <TableRow key={row.runId}>
                        <TableCell className="font-medium">
                          <Link
                            href={row.runHref}
                            className="underline-offset-4 hover:underline focus-visible:underline"
                          >
                            {row.runId.slice(0, 8)}
                          </Link>
                        </TableCell>
                        <TableCell>{row.startedAt}</TableCell>
                        <TableCell>{row.durationSeconds}</TableCell>
                        <TableCell>{row.totalTokens}</TableCell>
                        <TableCell>{row.turnsAndEvents}</TableCell>
                        <TableCell>{row.model}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{row.outcome}</TableCell>
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
