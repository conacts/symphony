"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

type IssueRunHistoryRow = {
  runId: string;
  runHref: string;
  startedAtIso: string;
  startedAt: string;
  durationSeconds: string;
  totalTokens: string;
  turnsAndEvents: string;
  model: string;
  status: string;
  outcome: string;
};

const allStatusFilterValue = "__all_statuses__";
const allOutcomeFilterValue = "__all_outcomes__";
const allModelFilterValue = "__all_models__";

export function IssueRunHistoryCard(input: {
  rows: IssueRunHistoryRow[];
}) {
  const statusOptions = useMemo(
    () =>
      [...new Set(input.rows.map((row) => row.status))]
        .filter((value) => value.length > 0)
        .sort((left, right) => left.localeCompare(right)),
    [input.rows]
  );
  const outcomeOptions = useMemo(
    () =>
      [...new Set(input.rows.map((row) => row.outcome))]
        .filter((value) => value.length > 0)
        .sort((left, right) => left.localeCompare(right)),
    [input.rows]
  );
  const modelOptions = useMemo(
    () =>
      [...new Set(input.rows.map((row) => row.model))]
        .filter((value) => value.length > 0)
        .sort((left, right) => left.localeCompare(right)),
    [input.rows]
  );
  const [statusFilter, setStatusFilter] = useState(allStatusFilterValue);
  const [outcomeFilter, setOutcomeFilter] = useState(allOutcomeFilterValue);
  const [modelFilter, setModelFilter] = useState(allModelFilterValue);
  const [startedSortDirection, setStartedSortDirection] = useState<"desc" | "asc">(
    "desc"
  );

  useEffect(() => {
    if (
      statusFilter !== allStatusFilterValue &&
      !statusOptions.includes(statusFilter)
    ) {
      setStatusFilter(allStatusFilterValue);
    }
  }, [statusFilter, statusOptions]);

  useEffect(() => {
    if (
      outcomeFilter !== allOutcomeFilterValue &&
      !outcomeOptions.includes(outcomeFilter)
    ) {
      setOutcomeFilter(allOutcomeFilterValue);
    }
  }, [outcomeFilter, outcomeOptions]);

  useEffect(() => {
    if (modelFilter !== allModelFilterValue && !modelOptions.includes(modelFilter)) {
      setModelFilter(allModelFilterValue);
    }
  }, [modelFilter, modelOptions]);

  const filteredRows = useMemo(
    () =>
      input.rows.filter((row) => {
        if (statusFilter !== allStatusFilterValue && row.status !== statusFilter) {
          return false;
        }

        if (outcomeFilter !== allOutcomeFilterValue && row.outcome !== outcomeFilter) {
          return false;
        }

        if (modelFilter !== allModelFilterValue && row.model !== modelFilter) {
          return false;
        }

        return true;
      }),
    [input.rows, modelFilter, outcomeFilter, statusFilter]
  );
  const sortedRows = useMemo(
    () =>
      [...filteredRows].sort((left, right) => {
        const comparison = left.startedAtIso.localeCompare(right.startedAtIso);

        if (comparison === 0) {
          return left.runId.localeCompare(right.runId);
        }

        return startedSortDirection === "desc" ? -comparison : comparison;
      }),
    [filteredRows, startedSortDirection]
  );

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Run history</CardTitle>
            <CardDescription>
              Browse recorded attempts for this issue.
            </CardDescription>
          </div>

          {input.rows.length > 0 ? (
            <Badge variant="secondary">
              {filteredRows.length} / {input.rows.length} visible
            </Badge>
          ) : null}
        </div>

        {input.rows.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full" size="sm" aria-label="Status filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={allStatusFilterValue}>All statuses</SelectItem>
                {statusOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
              <SelectTrigger className="w-full" size="sm" aria-label="Outcome filter">
                <SelectValue placeholder="All outcomes" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={allOutcomeFilterValue}>All outcomes</SelectItem>
                {outcomeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="w-full" size="sm" aria-label="Model filter">
                <SelectValue placeholder="All models" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={allModelFilterValue}>All models</SelectItem>
                {modelOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recorded runs for this issue yet.
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No runs match the current filters.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead
                  aria-sort={
                    startedSortDirection === "desc" ? "descending" : "ascending"
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-left font-medium transition-colors hover:text-foreground"
                    aria-label={`Sort by started ${startedSortDirection === "desc" ? "ascending" : "descending"}`}
                    onClick={() => {
                      setStartedSortDirection((current) =>
                        current === "desc" ? "asc" : "desc"
                      );
                    }}
                  >
                    Started
                    {startedSortDirection === "desc" ? (
                      <ArrowDownIcon className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ArrowUpIcon className="size-3.5 text-muted-foreground" />
                    )}
                  </button>
                </TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Total tokens</TableHead>
                <TableHead>Turns / events</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
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
  );
}
