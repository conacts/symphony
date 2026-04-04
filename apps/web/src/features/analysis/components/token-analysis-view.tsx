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
import { AnalysisPageHeader } from "@/features/analysis/components/analysis-page-header";
import { AnalysisSpotlightItem } from "@/features/analysis/components/analysis-spotlight-item";
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
          <AnalysisPageHeader
            eyebrow="Cross-run trends"
            title="Token analysis"
            description="Cross-run token pressure across runs, turns, and issues so you can see where orchestration cost is concentrating."
            focus="Use this page to identify which runs, turns, and issues are driving the largest share of current token usage."
          />

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Token coverage</h2>
              <p className="text-sm text-muted-foreground">
                High-level usage across the sampled runs before you drill into the biggest hotspots.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Usage profile</h2>
              <p className="text-sm text-muted-foreground">
                Token concentration across runs, turns, and current issue load.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Spotlight and charts</h2>
              <p className="text-sm text-muted-foreground">
                The heaviest run, turn, and issue first, followed by the charts that show how token pressure is spreading.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Token spotlight</CardTitle>
                <CardDescription>
                  The strongest current token hotspots across runs, turns, and issues.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <AnalysisSpotlightItem
                  label="Heaviest run"
                  value={input.tokenAnalysis.spotlight.heaviestRun}
                  detail={input.tokenAnalysis.spotlight.heaviestRunDetail}
                />
                <AnalysisSpotlightItem
                  label="Heaviest turn"
                  value={input.tokenAnalysis.spotlight.heaviestTurn}
                  detail={input.tokenAnalysis.spotlight.heaviestTurnDetail}
                />
                <AnalysisSpotlightItem
                  label="Hottest issue"
                  value={input.tokenAnalysis.spotlight.hottestIssue}
                  detail={input.tokenAnalysis.spotlight.hottestIssueDetail}
                  className="md:col-span-2"
                />
              </CardContent>
            </Card>

            <TokenRunChart rows={input.tokenAnalysis.runTokenRows} />
            <TokenTurnChart rows={input.tokenAnalysis.turnTokenRows} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Issue concentration</h2>
              <p className="text-sm text-muted-foreground">
                Which issues and runs are carrying the biggest share of token load in the current sample.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <TokenIssueChart rows={input.tokenAnalysis.issueTokenRows} />

            <Card>
              <CardHeader className="pb-4">
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
