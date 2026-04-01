"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  Copy,
  Download,
  MoreHorizontal
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { fetchIssueForensicsBundle } from "@/core/forensics-client";
import { buildIssueIndexViewModel } from "@/core/forensics-view-model";
import type { RuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import type {
  SymphonyForensicsIssueFlag,
  SymphonyForensicsIssueForensicsBundleResult,
  SymphonyForensicsIssueListResult,
  SymphonyForensicsIssuesQuery
} from "@symphony/contracts";

const defaultColumns = [
  "issue",
  "runs",
  "problemRate",
  "latestProblem",
  "lastCompleted",
  "retries",
  "tokens",
  "avgDuration",
  "lastActive",
  "flags",
  "actions"
] as const;

const columnLabels: Record<(typeof defaultColumns)[number], string> = {
  issue: "Issue",
  runs: "Runs",
  problemRate: "Problem rate",
  latestProblem: "Latest problem",
  lastCompleted: "Last completed",
  retries: "Retries",
  tokens: "Tokens",
  avgDuration: "Avg duration",
  lastActive: "Last active",
  flags: "Flags",
  actions: "Actions"
};

const flagOptions: Array<{
  value: SymphonyForensicsIssueFlag;
  label: string;
}> = [
  { value: "rate_limited", label: "Rate limited" },
  { value: "max_turns", label: "Max turns" },
  { value: "startup_failure", label: "Startup failure" },
  { value: "no_success", label: "No successful completion" },
  { value: "high_token_burn", label: "High token burn" },
  { value: "long_duration", label: "Long duration" },
  { value: "many_retries", label: "Many retries" }
];

const timeRangeOptions = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" }
] as const;

const sortOptions = [
  { value: "lastActive", label: "Last active" },
  { value: "problemRate", label: "Problem rate" },
  { value: "totalTokens", label: "Total tokens" },
  { value: "retries", label: "Retries" },
  { value: "runCount", label: "Run count" },
  { value: "avgDuration", label: "Avg duration" }
] as const;

export function IssueIndexView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  issueIndex: SymphonyForensicsIssueListResult | null;
  loading: boolean;
  onQueryChange: (query: SymphonyForensicsIssuesQuery) => void;
  query: SymphonyForensicsIssuesQuery;
  runtimeBaseUrl: string;
}) {
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>({});
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [columns, setColumns] = useState<string[]>([...defaultColumns]);
  const [bundleCache, setBundleCache] = useState<
    Record<string, SymphonyForensicsIssueForensicsBundleResult>
  >({});
  const [bundleErrors, setBundleErrors] = useState<Record<string, string>>({});
  const [loadingBundles, setLoadingBundles] = useState<Record<string, boolean>>({});
  const [copyState, setCopyState] = useState<string | null>(null);

  const scopedIssueIndex = useMemo(
    () => buildScopedIssueIndex(input.issueIndex, onlyFailures),
    [input.issueIndex, onlyFailures]
  );
  const viewModel = scopedIssueIndex
    ? buildIssueIndexViewModel(scopedIssueIndex)
    : null;

  useEffect(() => {
    setExpandedIssues({});
    setBundleCache({});
    setBundleErrors({});
    setLoadingBundles({});
  }, [input.query]);

  async function ensureBundle(issueIdentifier: string) {
    if (bundleCache[issueIdentifier] || loadingBundles[issueIdentifier]) {
      return bundleCache[issueIdentifier] ?? null;
    }

    setLoadingBundles((current) => ({
      ...current,
      [issueIdentifier]: true
    }));

    try {
      const bundle = await fetchIssueForensicsBundle(
        input.runtimeBaseUrl,
        issueIdentifier,
        toBundleQuery(input.query)
      );

      setBundleCache((current) => ({
        ...current,
        [issueIdentifier]: bundle
      }));
      setBundleErrors((current) => {
        const next = { ...current };
        delete next[issueIdentifier];
        return next;
      });

      return bundle;
    } catch (error) {
      setBundleErrors((current) => ({
        ...current,
        [issueIdentifier]:
          error instanceof Error
            ? error.message
            : "Failed to load issue forensic bundle."
      }));
      return null;
    } finally {
      setLoadingBundles((current) => ({
        ...current,
        [issueIdentifier]: false
      }));
    }
  }

  async function copyJson(label: string, payload: unknown) {
    const value = JSON.stringify(payload, null, 2);

    await navigator.clipboard.writeText(value);
    setCopyState(label);
    window.setTimeout(() => {
      setCopyState((current) => (current === label ? null : current));
    }, 2_000);
  }

  async function handleIssueExport(
    issueIdentifier: string,
    exportKind: "forensics" | "latestFailure" | "timeline" | "runtimeLogs"
  ) {
    const bundle = await ensureBundle(issueIdentifier);

    if (!bundle) {
      return;
    }

    switch (exportKind) {
      case "forensics":
        await copyJson(`issue:${issueIdentifier}`, {
          issue: bundle.issue,
          aggregateMetrics: bundle.issue,
          recentRuns: bundle.recentRuns,
          distributions: bundle.distributions,
          appliedFilters: bundle.filters
        });
        return;
      case "latestFailure":
        await copyJson(`failure:${issueIdentifier}`, {
          issueIdentifier: bundle.issue.issueIdentifier,
          latestFailure: bundle.latestFailure
        });
        return;
      case "timeline":
        await copyJson(`timeline:${issueIdentifier}`, bundle.timeline);
        return;
      case "runtimeLogs":
        await copyJson(`logs:${issueIdentifier}`, bundle.runtimeLogs);
        return;
    }
  }

  function updateQuery(next: Partial<SymphonyForensicsIssuesQuery>) {
    input.onQueryChange({
      ...input.query,
      ...next
    });
  }

  function updateTimeRange(value: "all" | "24h" | "7d" | "30d") {
    const now = Date.now();
    const lookbackMs =
      value === "24h"
        ? 24 * 60 * 60 * 1000
        : value === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : value === "30d"
            ? 30 * 24 * 60 * 60 * 1000
            : null;

    updateQuery({
      timeRange: value,
      startedAfter: lookbackMs === null ? undefined : new Date(now - lookbackMs).toISOString(),
      startedBefore: undefined
    });
  }

  function toggleFlag(flag: SymphonyForensicsIssueFlag) {
    const currentFlags = parseFlags(input.query.hasFlag);
    const nextFlags = currentFlags.includes(flag)
      ? currentFlags.filter((currentFlag) => currentFlag !== flag)
      : [...currentFlags, flag];

    updateQuery({
      hasFlag: nextFlags.length === 0 ? undefined : nextFlags.join(",")
    });
  }

  function toggleColumn(column: string) {
    setColumns((current) =>
      current.includes(column)
        ? current.filter((currentColumn) => currentColumn !== column)
        : [...current, column]
    );
  }

  async function toggleExpanded(issueIdentifier: string) {
    const isOpening = !expandedIssues[issueIdentifier];

    setExpandedIssues((current) => ({
      ...current,
      [issueIdentifier]: isOpening
    }));

    if (isOpening) {
      await ensureBundle(issueIdentifier);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Issue forensics degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {copyState ? (
        <Alert>
          <AlertTitle>JSON copied</AlertTitle>
          <AlertDescription>{copyState}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          {(() => {
            const activeIssueIndex = scopedIssueIndex!;

            return (
              <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Issues</h1>
              <p className="text-sm text-muted-foreground">
                Historical process forensics for Symphony issue execution
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    {labelForTimeRange(input.query.timeRange ?? "all")}
                    <ChevronDown className="ml-2 size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Time range</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={input.query.timeRange ?? "all"}
                    onValueChange={(value) =>
                      updateTimeRange(value as "all" | "24h" | "7d" | "30d")
                    }
                  >
                    {timeRangeOptions.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled>Custom</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    Saved view
                    <ChevronDown className="ml-2 size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled>Placeholder</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Download className="mr-2 size-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      void copyJson("visible-issues", {
                        filters: activeIssueIndex.filters,
                        totals: activeIssueIndex.totals,
                        issues: activeIssueIndex.issues
                      })
                    }
                  >
                    Copy visible issues JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void copyJson("issue-totals", {
                        filters: activeIssueIndex.filters,
                        totals: activeIssueIndex.totals
                      })
                    }
                  >
                    Copy aggregate JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {viewModel.summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="space-y-1 pb-2">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-2xl">{card.value}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {card.detail}
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-2 xl:flex-row xl:flex-wrap">
                <FilterDropdown
                  label="Outcome"
                  value={input.query.outcome ?? ""}
                  options={[
                    { value: "", label: "All outcomes" },
                    ...viewModel.facets.outcomes.map((outcome) => ({
                      value: outcome,
                      label: outcome
                    }))
                  ]}
                  onChange={(value) =>
                    updateQuery({
                      outcome: value === "" ? undefined : value
                    })
                  }
                />
                <FilterDropdown
                  label="Error class"
                  value={input.query.errorClass ?? ""}
                  options={[
                    { value: "", label: "All error classes" },
                    ...viewModel.facets.errorClasses.map((errorClass) => ({
                      value: errorClass,
                      label: errorClass
                    }))
                  ]}
                  onChange={(value) =>
                    updateQuery({
                      errorClass: value === "" ? undefined : value
                    })
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      Flags
                      {parseFlags(input.query.hasFlag).length > 0
                        ? ` (${parseFlags(input.query.hasFlag).length})`
                        : ""}
                      <ChevronDown className="ml-2 size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Flags</DropdownMenuLabel>
                    {flagOptions.map((flag) => (
                      <DropdownMenuCheckboxItem
                        key={flag.value}
                        checked={parseFlags(input.query.hasFlag).includes(flag.value)}
                        onCheckedChange={() => toggleFlag(flag.value)}
                      >
                        {flag.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <FilterDropdown
                  label="Time range"
                  value={input.query.timeRange ?? "all"}
                  options={timeRangeOptions.map((option) => ({
                    value: option.value,
                    label: option.label
                  }))}
                  onChange={(value) => updateTimeRange(value as "all" | "24h" | "7d" | "30d")}
                />
                <FilterDropdown
                  label="Sort by"
                  value={input.query.sortBy ?? "lastActive"}
                  options={sortOptions.map((option) => ({
                    value: option.value,
                    label: option.label
                  }))}
                  onChange={(value) =>
                    updateQuery({
                      sortBy: value as SymphonyForensicsIssuesQuery["sortBy"]
                    })
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Columns3 className="mr-2 size-4" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Columns</DropdownMenuLabel>
                    {defaultColumns.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column}
                        checked={columns.includes(column)}
                        onCheckedChange={() => toggleColumn(column)}
                      >
                        {columnLabels[column]}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Switch checked={onlyFailures} onCheckedChange={setOnlyFailures} />
                <span>Only issues with failures</span>
              </div>
            </CardHeader>
            <CardContent>
              {viewModel.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recorded issue runs match the current forensic scope.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      {columns.includes("issue") ? <TableHead>Issue</TableHead> : null}
                      {columns.includes("runs") ? <TableHead>Runs</TableHead> : null}
                      {columns.includes("problemRate") ? <TableHead>Problem rate</TableHead> : null}
                      {columns.includes("latestProblem") ? (
                        <TableHead>Latest problem</TableHead>
                      ) : null}
                      {columns.includes("lastCompleted") ? (
                        <TableHead>Last completed</TableHead>
                      ) : null}
                      {columns.includes("retries") ? <TableHead>Retries</TableHead> : null}
                      {columns.includes("tokens") ? <TableHead>Tokens</TableHead> : null}
                      {columns.includes("avgDuration") ? (
                        <TableHead>Avg duration</TableHead>
                      ) : null}
                      {columns.includes("lastActive") ? <TableHead>Last active</TableHead> : null}
                      {columns.includes("flags") ? <TableHead>Flags</TableHead> : null}
                      {columns.includes("actions") ? <TableHead>Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewModel.rows.map((row) => {
                      const isExpanded = expandedIssues[row.issueIdentifier] ?? false;
                      const bundle = bundleCache[row.issueIdentifier];
                      const issueRow = activeIssueIndex.issues.find(
                        (issue) => issue.issueIdentifier === row.issueIdentifier
                      );

                      return (
                        <React.Fragment key={row.issueIdentifier}>
                          <TableRow>
                            <TableCell>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => void toggleExpanded(row.issueIdentifier)}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </Button>
                            </TableCell>
                            {columns.includes("issue") ? (
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <Link
                                    className="font-medium underline underline-offset-4"
                                    href={row.issueHref}
                                  >
                                    {row.issueIdentifier}
                                  </Link>
                                  <span className="text-xs text-muted-foreground">
                                    {row.latestErrorClass}
                                  </span>
                                </div>
                              </TableCell>
                            ) : null}
                            {columns.includes("runs") ? <TableCell>{row.runCount}</TableCell> : null}
                            {columns.includes("problemRate") ? (
                              <TableCell>{row.problemRate}</TableCell>
                            ) : null}
                            {columns.includes("latestProblem") ? (
                              <TableCell>{row.latestProblemOutcome}</TableCell>
                            ) : null}
                            {columns.includes("lastCompleted") ? (
                              <TableCell>{row.lastCompletedOutcome}</TableCell>
                            ) : null}
                            {columns.includes("retries") ? <TableCell>{row.retryCount}</TableCell> : null}
                            {columns.includes("tokens") ? <TableCell>{row.totalTokens}</TableCell> : null}
                            {columns.includes("avgDuration") ? (
                              <TableCell>{row.avgDuration}</TableCell>
                            ) : null}
                            {columns.includes("lastActive") ? <TableCell>{row.lastActive}</TableCell> : null}
                            {columns.includes("flags") ? (
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {row.flags.length === 0 ? (
                                    <span className="text-xs text-muted-foreground">none</span>
                                  ) : (
                                    row.flags.map((flag) => (
                                      <Badge key={flag} variant="outline">
                                        {flag}
                                      </Badge>
                                    ))
                                  )}
                                </div>
                              </TableCell>
                            ) : null}
                            {columns.includes("actions") ? (
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="ghost">
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        window.location.assign(row.issueHref)
                                      }
                                    >
                                      Open issue detail
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        void handleIssueExport(
                                          row.issueIdentifier,
                                          "forensics"
                                        )
                                      }
                                    >
                                      Copy issue forensic JSON
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        void handleIssueExport(
                                          row.issueIdentifier,
                                          "latestFailure"
                                        )
                                      }
                                    >
                                      Copy latest failure JSON
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        void handleIssueExport(
                                          row.issueIdentifier,
                                          "timeline"
                                        )
                                      }
                                    >
                                      Copy timeline JSON
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        void handleIssueExport(
                                          row.issueIdentifier,
                                          "runtimeLogs"
                                        )
                                      }
                                    >
                                      Copy runtime logs JSON
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            ) : null}
                          </TableRow>

                          {isExpanded ? (
                            <TableRow>
                              <TableCell colSpan={columns.length + 1}>
                                <div className="grid gap-4 rounded-lg border bg-muted/20 p-4">
                                  {loadingBundles[row.issueIdentifier] ? (
                                    <div className="grid gap-3 lg:grid-cols-2">
                                      <Skeleton className="h-28 w-full" />
                                      <Skeleton className="h-28 w-full" />
                                    </div>
                                  ) : bundle ? (
                                    <>
                                      <div className="grid gap-4 lg:grid-cols-2">
                                        <section className="space-y-2">
                                          <h3 className="text-sm font-medium">
                                            Recent run snapshot
                                          </h3>
                                          <div className="space-y-2 text-xs">
                                            {bundle.recentRuns.map((run) => (
                                              <div
                                                key={run.runId}
                                                className="grid grid-cols-2 gap-2 rounded border bg-background p-2 lg:grid-cols-7"
                                              >
                                                <span>{run.outcome ?? "n/a"}</span>
                                                <span>{run.status ?? "n/a"}</span>
                                                <span>{run.startedAt ?? "n/a"}</span>
                                                <span>{run.durationSeconds ?? "n/a"}s</span>
                                                <span>{run.turnCount} turns</span>
                                                <span>{run.eventCount} events</span>
                                                <span>{run.totalTokens} tokens</span>
                                              </div>
                                            ))}
                                          </div>
                                        </section>

                                        <section className="space-y-2">
                                          <h3 className="text-sm font-medium">Distributions</h3>
                                          <div className="grid gap-3 text-xs lg:grid-cols-3">
                                            <DistributionList
                                              title="Outcomes"
                                              values={bundle.distributions.outcomes}
                                            />
                                            <DistributionList
                                              title="Error classes"
                                              values={bundle.distributions.errorClasses}
                                            />
                                            <DistributionList
                                              title="Timeline events"
                                              values={bundle.distributions.timelineEvents}
                                            />
                                          </div>
                                        </section>
                                      </div>

                                      <div className="grid gap-4 lg:grid-cols-2">
                                        <section className="space-y-2 rounded border bg-background p-3">
                                          <h3 className="text-sm font-medium">Latest failure</h3>
                                          {bundle.latestFailure ? (
                                            <div className="space-y-1 text-xs text-muted-foreground">
                                              <p>
                                                <span className="font-medium text-foreground">
                                                  Error class:
                                                </span>{" "}
                                                {bundle.latestFailure.errorClass ?? "n/a"}
                                              </p>
                                              <p>
                                                <span className="font-medium text-foreground">
                                                  Error message:
                                                </span>{" "}
                                                {bundle.latestFailure.errorMessage ?? "n/a"}
                                              </p>
                                              <p>
                                                <span className="font-medium text-foreground">
                                                  Last failing run:
                                                </span>{" "}
                                                {bundle.latestFailure.runId}
                                              </p>
                                              <p>
                                                <span className="font-medium text-foreground">
                                                  Started:
                                                </span>{" "}
                                                {bundle.latestFailure.startedAt ?? "n/a"}
                                              </p>
                                            </div>
                                          ) : (
                                            <p className="text-xs text-muted-foreground">
                                              No failing run exists in the current scope.
                                            </p>
                                          )}
                                        </section>

                                        <section className="space-y-2 rounded border bg-background p-3">
                                          <h3 className="text-sm font-medium">Export actions</h3>
                                          <div className="flex flex-wrap gap-2">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() =>
                                                void handleIssueExport(
                                                  row.issueIdentifier,
                                                  "forensics"
                                                )
                                              }
                                            >
                                              <Copy className="mr-2 size-4" />
                                              Copy issue forensic JSON
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() =>
                                                void handleIssueExport(
                                                  row.issueIdentifier,
                                                  "timeline"
                                                )
                                              }
                                            >
                                              <Copy className="mr-2 size-4" />
                                              Copy timeline JSON
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() =>
                                                void handleIssueExport(
                                                  row.issueIdentifier,
                                                  "runtimeLogs"
                                                )
                                              }
                                            >
                                              <Copy className="mr-2 size-4" />
                                              Copy logs JSON
                                            </Button>
                                          </div>
                                          {issueRow ? (
                                            <p className="text-xs text-muted-foreground">
                                              {issueRow.totalTokens} tokens, {issueRow.runCount} runs,
                                              {issueRow.problemRunCount} problem runs.
                                            </p>
                                          ) : null}
                                        </section>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="text-sm text-destructive">
                                      {bundleErrors[row.issueIdentifier] ??
                                        "Unable to load forensic drilldown."}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
              </>
            );
          })()}
        </>
      ) : input.loading ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
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
            <CardTitle>Issue forensics unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function FilterDropdown(input: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
  value: string;
}) {
  const currentLabel =
    input.options.find((option) => option.value === input.value)?.label ?? input.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          {currentLabel}
          <ChevronDown className="ml-2 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{input.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={input.value} onValueChange={input.onChange}>
          {input.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DistributionList(input: {
  title: string;
  values: Record<string, number>;
}) {
  const entries = Object.entries(input.values).sort((left, right) => right[1] - left[1]);

  return (
    <div className="rounded border bg-background p-3">
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {input.title}
      </h4>
      <div className="space-y-1 text-xs">
        {entries.length === 0 ? (
          <p className="text-muted-foreground">none</p>
        ) : (
          entries.map(([key, count]) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="truncate">{key}</span>
              <span className="font-medium">{count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function buildScopedIssueIndex(
  issueIndex: SymphonyForensicsIssueListResult | null,
  onlyFailures: boolean
): SymphonyForensicsIssueListResult | null {
  if (!issueIndex) {
    return null;
  }

  const issues = onlyFailures
    ? issueIndex.issues.filter((issue) => issue.problemRunCount > 0)
    : issueIndex.issues;

  return {
    ...issueIndex,
    issues,
    totals: issues.reduce(
      (totals, issue) => ({
        issueCount: totals.issueCount + 1,
        runCount: totals.runCount + issue.runCount,
        completedRunCount: totals.completedRunCount + issue.completedRunCount,
        problemRunCount: totals.problemRunCount + issue.problemRunCount,
        rateLimitedCount: totals.rateLimitedCount + issue.rateLimitedCount,
        maxTurnsCount: totals.maxTurnsCount + issue.maxTurnsCount,
        startupFailureCount: totals.startupFailureCount + issue.startupFailureCount,
        inputTokens: totals.inputTokens + issue.totalInputTokens,
        outputTokens: totals.outputTokens + issue.totalOutputTokens,
        totalTokens: totals.totalTokens + issue.totalTokens
      }),
      {
        issueCount: 0,
        runCount: 0,
        completedRunCount: 0,
        problemRunCount: 0,
        rateLimitedCount: 0,
        maxTurnsCount: 0,
        startupFailureCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      }
    )
  };
}

function toBundleQuery(
  query: SymphonyForensicsIssuesQuery
): SymphonyForensicsIssuesQuery & {
  recentRunLimit: number;
  timelineLimit: number;
  runtimeLogLimit: number;
} {
  return {
    ...query,
    recentRunLimit: 8,
    timelineLimit: 200,
    runtimeLogLimit: 200
  };
}

function parseFlags(value: string | undefined): SymphonyForensicsIssueFlag[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((flag) => flag.trim())
    .filter((flag): flag is SymphonyForensicsIssueFlag => flag.length > 0);
}

function labelForTimeRange(value: string): string {
  return timeRangeOptions.find((option) => option.value === value)?.label ?? "All time";
}
