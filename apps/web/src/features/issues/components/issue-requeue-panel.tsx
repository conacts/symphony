import React from "react";
import { ArrowUpRightIcon } from "lucide-react";
import type { SymphonyRuntimeIssueResult } from "@symphony/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function IssueRequeuePanel(input: {
  error: string | null;
  issue: SymphonyRuntimeIssueResult | null;
  issueIdentifier: string;
  loading: boolean;
}) {
  if (input.loading && !input.issue) {
    return (
      <section className="flex flex-col gap-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">
          {input.issue?.tracked.title ?? input.issueIdentifier}
        </h1>

        {input.issue ? (
          <div className="flex flex-wrap gap-2">
            {input.issue.tracked.url ? (
              <Button asChild variant="outline">
                <a
                  href={input.issue.tracked.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Linear
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
                  GitHub
                  <ArrowUpRightIcon data-icon="inline-end" />
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Runtime issue context unavailable</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {!input.issue ? (
        <p className="text-sm text-muted-foreground">
          No runtime issue context is available yet for this issue.
        </p>
      ) : null}
    </section>
  );
}
