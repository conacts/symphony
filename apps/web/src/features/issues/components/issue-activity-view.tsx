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
import type { RuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import type { SymphonyForensicsIssueForensicsBundleResult } from "@symphony/contracts";
import { IssueActivityFeed } from "@/features/issues/components/issue-activity-feed";
import { buildIssueActivityViewModel } from "@/features/issues/model/issue-view-model";

export function IssueActivityView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  issueActivity: SymphonyForensicsIssueForensicsBundleResult | null;
  issueIdentifier: string;
  loading: boolean;
}) {
  const viewModel = input.issueActivity
    ? buildIssueActivityViewModel(input.issueActivity)
    : null;

  return (
    <div className="flex flex-col gap-8">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Issue activity degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {input.issueIdentifier}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Issue activity</h1>
            <p className="text-sm text-muted-foreground">
              Unified tracker, workspace, runtime, and Codex activity for this issue.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {viewModel.metrics.map((metric) => (
              <Card key={metric.label}>
                <CardHeader>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="text-2xl">{metric.value}</CardTitle>
                  {metric.detail ? (
                    <CardDescription>{metric.detail}</CardDescription>
                  ) : null}
                </CardHeader>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Back to issue runs</CardTitle>
              <CardDescription>
                Return to the issue run history surface.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={`/issues/${input.issueIdentifier}`}
                className="text-sm font-medium text-foreground underline underline-offset-4"
              >
                Open issue runs
              </Link>
            </CardContent>
          </Card>

          {viewModel.latestFailure ? (
            <Card>
              <CardHeader>
                <CardTitle>Latest failure</CardTitle>
                <CardDescription>
                  Most recent failing or degraded execution captured for this issue.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="font-medium text-foreground">Run</p>
                  <p>{viewModel.latestFailure.runId}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Started</p>
                  <p>{viewModel.latestFailure.startedAt}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Outcome</p>
                  <p>{viewModel.latestFailure.outcome}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Error class</p>
                  <p>{viewModel.latestFailure.errorClass}</p>
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <p className="font-medium text-foreground">Message</p>
                  <p>{viewModel.latestFailure.errorMessage}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <IssueActivityFeed rows={viewModel.activityRows} />
        </>
      ) : input.loading ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-20" />
              </CardHeader>
            </Card>
          ))}
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Issue activity unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
