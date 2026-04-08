"use client";

import React from "react";
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
import { IssueRunMachineLoadChart } from "@/features/issues/components/issue-run-machine-load-chart";
import { IssueRunHistoryCard } from "@/features/issues/components/issue-run-history-card";
import { IssueRunTokenChart } from "@/features/issues/components/issue-run-token-chart";
import { buildIssueDetailViewModel } from "@/features/issues/model/issue-view-model";

export function IssueDetailView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  issueDetail: SymphonyForensicsIssueDetailResult | null;
  loading: boolean;
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
          <section className="grid gap-6 xl:grid-cols-2">
            <IssueRunTokenChart rows={viewModel.tokenChartRows} />
            <IssueRunMachineLoadChart rows={viewModel.machineLoadChartRows} />
          </section>

          <IssueRunHistoryCard rows={viewModel.rows} />
        </>
      ) : input.loading ? (
        <div className="flex flex-col gap-6">
          <section className="grid gap-6 xl:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <Card key={index}>
                <CardHeader className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-72 w-full" />
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
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
