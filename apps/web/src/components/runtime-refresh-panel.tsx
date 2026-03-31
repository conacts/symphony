import React from "react";
import { RefreshCcwIcon } from "lucide-react";
import type { SymphonyRuntimeRefreshResult } from "@symphony/contracts";
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

export function RuntimeRefreshPanel(input: {
  error: string | null;
  lastResult: SymphonyRuntimeRefreshResult | null;
  onRefresh: () => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <CardTitle>Refresh runtime now</CardTitle>
          <CardDescription>
            Trigger the admitted poll and reconcile cycle immediately instead of
            waiting for the next scheduled tracker tick.
          </CardDescription>
        </div>
        <Button disabled={input.pending} onClick={input.onRefresh} type="button">
          <RefreshCcwIcon />
          {input.pending ? "Refreshing..." : "Refresh now"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {["poll", "reconcile"].map((operation) => (
            <Badge key={operation} variant="secondary">
              Delegates to {operation}
            </Badge>
          ))}
        </div>

        {input.error ? (
          <Alert variant="destructive">
            <AlertTitle>Refresh failed</AlertTitle>
            <AlertDescription>{input.error}</AlertDescription>
          </Alert>
        ) : null}

        {input.lastResult ? (
          <Alert>
            <AlertTitle>Refresh requested</AlertTitle>
            <AlertDescription>
              Requested at {input.lastResult.requestedAt}. The runtime accepted the
              standard poll/reconcile path without opening a private control lane.
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">
            This is an operational convenience only. It does not rewrite issue
            state or inject new instructions into a running agent.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
