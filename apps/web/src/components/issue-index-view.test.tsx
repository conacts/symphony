import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueListResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { IssueIndexView } from "@/features/issues/components/issue-index-view";

function buildPagedIssueIndexResult() {
  const base = buildSymphonyForensicsIssueListResult();
  const issues = Array.from({ length: 10 }, (_, index) => {
    const template = base.issues[index % base.issues.length]!;
    const issueNumber = 165 + index;
    const startedAt = new Date(
      Date.parse(template.latestRunStartedAt) - index * 24 * 60 * 60 * 1000
    ).toISOString();
    const activityAt = new Date(
      Date.parse(template.latestActivityAt ?? template.latestRunStartedAt) -
        index * 24 * 60 * 60 * 1000
    ).toISOString();

    return {
      ...template,
      issueId: `issue_${issueNumber}`,
      issueIdentifier: `COL-${issueNumber}`,
      latestRunStartedAt: startedAt,
      latestRunId: `run_${issueNumber}`,
      latestDeliveryRunId:
        template.latestDeliveryRunId === null ? null : `run_${issueNumber}`,
      latestDeliveryPrUrl:
        template.latestDeliveryPrUrl === null
          ? null
          : `https://github.com/example/repo/pull/${issueNumber}`,
      latestDeliveryReportedAt:
        template.latestDeliveryReportedAt === null ? null : activityAt,
      latestActivityAt: activityAt,
      insertedAt: startedAt,
      updatedAt: activityAt
    };
  });

  const totals = issues.reduce(
    (result, issue) => ({
      issueCount: result.issueCount + 1,
      runCount: result.runCount + issue.runCount,
      completedRunCount: result.completedRunCount + issue.completedRunCount,
      problemRunCount: result.problemRunCount + issue.problemRunCount,
      rateLimitedCount: result.rateLimitedCount + issue.rateLimitedCount,
      maxTurnsCount: result.maxTurnsCount + issue.maxTurnsCount,
      startupFailureCount: result.startupFailureCount + issue.startupFailureCount,
      inputTokens: result.inputTokens + issue.totalInputTokens,
      cachedInputTokens: result.cachedInputTokens + issue.totalCachedInputTokens,
      outputTokens: result.outputTokens + issue.totalOutputTokens,
      totalTokens: result.totalTokens + issue.totalTokens
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
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
  );

  return {
    ...base,
    issues,
    totals
  };
}

describe("issue index view", () => {
  it("renders a paginated issue inventory", () => {
    const html = renderToStaticMarkup(
      <IssueIndexView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        issueIndex={buildPagedIssueIndexResult()}
        loading={false}
        onQueryChange={() => {}}
        query={{
          timeRange: "all",
          sortBy: "lastActive",
          sortDirection: "desc"
        }}
      />
    );

    expect(html).toContain("Issues");
    expect(html).toContain("COL-165");
    expect(html).toContain("Issue outcome pressure");
    expect(html).toContain("Retry and failure pressure");
    expect(html).toContain("Issue inventory");
    expect(html).toContain("Retries");
    expect(html).toContain("Showing 1-8 of 10 issues.");
    expect(html).toContain("Page 1 of 2");
    expect(html).not.toContain("Most active issue");
    expect(html).toContain("Total issues");
    expect(html).toContain('href="/issues/COL-165?repo=symphony"');
    expect(html).not.toContain("COL-173");
  });
});
