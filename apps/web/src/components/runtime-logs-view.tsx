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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { RuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import { formatTimestamp } from "@/core/forensics-view-model";
import type { SymphonyRuntimeLogsResult } from "@symphony/contracts";

export function RuntimeLogsView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  logs: SymphonyRuntimeLogsResult | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Runtime logs degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.logs ? (
        <Card>
          <CardHeader>
            <CardTitle>Runtime logs</CardTitle>
            <CardDescription>
              Persisted runtime-side platform logs across the current control plane.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {input.logs.logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No runtime logs have been recorded yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>Run</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {input.logs.logs.map((entry) => (
                    <TableRow key={entry.entryId}>
                      <TableCell>{formatTimestamp(entry.recordedAt)}</TableCell>
                      <TableCell>{entry.level}</TableCell>
                      <TableCell>{entry.source}</TableCell>
                      <TableCell>{entry.eventType}</TableCell>
                      <TableCell>{entry.issueIdentifier ?? "n/a"}</TableCell>
                      <TableCell>{entry.runId ?? "n/a"}</TableCell>
                      <TableCell className="max-w-md truncate">{entry.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : input.loading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Runtime logs unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
