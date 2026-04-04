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
import type { RuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import type { SymphonyForensicsIssueDetailResult } from "@symphony/contracts";
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
                  <CardTitle className="text-3xl">{metric.value}</CardTitle>
                  {metric.detail ? (
                    <CardDescription>{metric.detail}</CardDescription>
                  ) : null}
                </CardHeader>
              </Card>
            ))}
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
                      <TableHead>Status</TableHead>
                      <TableHead>Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewModel.rows.map((row) => (
                      <TableRow
                        key={row.runId}
                        tabIndex={0}
                        className="cursor-pointer"
                        onClick={() => window.location.assign(row.runHref)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            window.location.assign(row.runHref);
                          }
                        }}
                      >
                        <TableCell className="font-medium">
                          {row.runId.slice(0, 8)}
                        </TableCell>
                        <TableCell>{row.startedAt}</TableCell>
                        <TableCell>{row.durationSeconds}</TableCell>
                        <TableCell>{row.totalTokens}</TableCell>
                        <TableCell>{row.turnsAndEvents}</TableCell>
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
