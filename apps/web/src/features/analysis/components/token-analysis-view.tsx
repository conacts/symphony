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
import { TokenIssueChart } from "@/features/analysis/components/token-issue-chart";
import { TokenRunChart } from "@/features/analysis/components/token-run-chart";
import { TokenTurnChart } from "@/features/analysis/components/token-turn-chart";
import type { TokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function TokenAnalysisView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  tokenAnalysis: TokenAnalysisViewModel | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Token analysis degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.tokenAnalysis ? (
        <>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Token analysis</h1>
            <p className="text-sm text-muted-foreground">
              Cross-run token pressure across runs, turns, and issues so you can see where orchestration cost is concentrating.
            </p>
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {input.tokenAnalysis.summaryCards.map((card) => (
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

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {input.tokenAnalysis.tokenCards.map((card) => (
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

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Token spotlight</CardTitle>
                <CardDescription>
                  The strongest current token hotspots across runs, turns, and issues.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Heaviest run</p>
                  <p className="mt-2 break-all text-xl font-semibold">
                    {input.tokenAnalysis.spotlight.heaviestRun}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.tokenAnalysis.spotlight.heaviestRunDetail}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Heaviest turn</p>
                  <p className="mt-2 break-all text-xl font-semibold">
                    {input.tokenAnalysis.spotlight.heaviestTurn}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.tokenAnalysis.spotlight.heaviestTurnDetail}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4 md:col-span-2">
                  <p className="text-sm text-muted-foreground">Hottest issue</p>
                  <p className="mt-2 break-all text-xl font-semibold">
                    {input.tokenAnalysis.spotlight.hottestIssue}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.tokenAnalysis.spotlight.hottestIssueDetail}
                  </p>
                </div>
              </CardContent>
            </Card>

            <TokenRunChart rows={input.tokenAnalysis.runTokenRows} />
            <TokenTurnChart rows={input.tokenAnalysis.turnTokenRows} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <TokenIssueChart rows={input.tokenAnalysis.issueTokenRows} />

            <Card>
              <CardHeader>
                <CardTitle>Token hotspots</CardTitle>
                <CardDescription>
                  The heaviest sampled runs and the issue contexts carrying them.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {input.tokenAnalysis.hotspotRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No token hotspots are active in the current sample.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Issue</TableHead>
                        <TableHead>Run</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Input</TableHead>
                        <TableHead>Output</TableHead>
                        <TableHead>Started</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {input.tokenAnalysis.hotspotRows.map((row) => (
                        <TableRow key={`${row.scope}:${row.label}`}>
                          <TableCell className="font-medium">
                            <Link
                              href={row.issueHref}
                              className="underline-offset-4 hover:underline focus-visible:underline"
                            >
                              {row.scope}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={row.runHref}
                              className="underline-offset-4 hover:underline focus-visible:underline"
                            >
                              {row.label}
                            </Link>
                          </TableCell>
                          <TableCell>{row.totalTokens}</TableCell>
                          <TableCell>{row.inputTokens}</TableCell>
                          <TableCell>{row.outputTokens}</TableCell>
                          <TableCell>{row.startedAt}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
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
                <Skeleton className="h-4 w-44" />
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Token analysis unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
