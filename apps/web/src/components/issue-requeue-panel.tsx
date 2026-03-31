import React from "react";
import { ArrowUpRightIcon } from "lucide-react";
import type { SymphonyRuntimeIssueResult } from "@symphony/contracts";
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
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";

export function IssueRequeuePanel(input: {
  error: string | null;
  issue: SymphonyRuntimeIssueResult | null;
  loading: boolean;
}) {
  if (input.loading && !input.issue) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Requeue through the existing workflow</CardTitle>
          <CardDescription>
            Loading the runtime-backed operator context for this issue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requeue through the existing workflow</CardTitle>
        <CardDescription>
          V1 keeps requeue semantics in GitHub and Linear. The dashboard points you
          at those admitted paths instead of injecting a hidden mid-run message.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {input.error ? (
          <Alert variant="destructive">
            <AlertTitle>Runtime issue context unavailable</AlertTitle>
            <AlertDescription>{input.error}</AlertDescription>
          </Alert>
        ) : null}

        {input.issue ? (
          <>
            <div className="flex flex-wrap gap-2">
              {input.issue.operator.requeueDelegatesTo.map((target) => (
                <Badge key={target} variant="secondary">
                  Delegates to {target === "linear" ? "Linear" : "GitHub /rework"}
                </Badge>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {input.issue.tracked.url ? (
                <Button asChild variant="outline">
                  <a
                    href={input.issue.tracked.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open in Linear
                    <ArrowUpRightIcon data-icon="inline-end" />
                  </a>
                </Button>
              ) : null}

              {input.issue.operator.githubPullRequestSearchUrl ? (
                <Button asChild variant="outline">
                  <a
                    href={input.issue.operator.githubPullRequestSearchUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open GitHub PR search
                    <ArrowUpRightIcon data-icon="inline-end" />
                  </a>
                </Button>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {input.issue.tracked.title}
              </p>
              <p>Current tracker state: {input.issue.tracked.state}</p>
              <p>
                Use <Kbd>{input.issue.operator.requeueCommand}</Kbd> on the PR, or
                move the Linear issue back into a dispatchable state.
              </p>
              {input.issue.tracked.branchName ? (
                <p>Expected branch: {input.issue.tracked.branchName}</p>
              ) : null}
            </div>

            <p className="text-sm text-muted-foreground">
              {input.issue.operator.requeueHelpText}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No runtime issue context is available yet for this issue.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
