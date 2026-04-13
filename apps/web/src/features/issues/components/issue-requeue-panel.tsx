import React from "react";
import { ArrowUpRightIcon } from "lucide-react";
import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyRuntimeIssueResult
} from "@symphony/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildIssueTimelineHref } from "@/core/control-plane-routes";
import { formatTimestamp } from "@/core/display-formatters";

export function IssueRequeuePanel(input: {
  error: string | null;
  issueDetail: SymphonyForensicsIssueDetailResult | null;
  issue: SymphonyRuntimeIssueResult | null;
  trackerIssueKey: string;
  loading: boolean;
}) {
  const piConfig = input.issue?.operator.pi ?? null;
  const selectedModel = piConfig?.selectedModel ?? piConfig?.defaultModel ?? null;
  const latestRunStartedAt = input.issueDetail
    ? [...input.issueDetail.runs]
        .sort((left, right) => {
          const leftStartedAt = new Date(left.startedAt).getTime();
          const rightStartedAt = new Date(right.startedAt).getTime();

          return rightStartedAt - leftStartedAt;
        })[0]?.startedAt ?? null
    : null;
  const timelineHref = input.issueDetail
    ? buildIssueTimelineHref(input.trackerIssueKey, {
        repo: input.issueDetail.repositoryKey
      })
    : null;

  if (input.loading && !input.issue) {
    return (
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Skeleton className="h-9 w-72" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {input.issue?.tracked.title ?? input.trackerIssueKey}
          </h1>

          {input.issue ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary" className="font-mono">
                {selectedModel ?? "n/a"}
              </Badge>
              <Badge variant="outline">{input.issue.tracked.state}</Badge>
              {latestRunStartedAt ? (
                <Badge variant="outline">
                  Last run {formatTimestamp(latestRunStartedAt)}
                </Badge>
              ) : null}
              {input.issueDetail?.summary.latestDeliveryReportedAt ? (
                <Badge variant="outline">
                  Delivery {formatTimestamp(input.issueDetail.summary.latestDeliveryReportedAt)}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        {input.issue ? (
          <div className="flex flex-wrap gap-2 md:justify-end">
            {input.issue.tracked.url ? (
              <Button asChild variant="outline" size="sm">
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
              <Button asChild variant="outline" size="sm">
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

            {timelineHref ? (
              <Button asChild variant="outline" size="sm">
                <a href={timelineHref}>
                  Timeline
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
