import { describe, expect, it } from "vitest";
import {
  buildIssueDetailViewModel,
  buildIssueIndexViewModel
} from "@/features/issues/model/issue-view-model";

describe("forensics view model", () => {
  it("formats the issue index summary", () => {
    const issueIndex = buildIssueIndexViewModel({
      issues: [
        {
          repositoryKey: "symphony",
          trackerIssueId: "issue_123",
          issueIdentifier: "COL-165",
          latestRunStartedAt: "2026-03-31T18:00:00.000Z",
          latestRunId: "run_123",
          latestRunStatus: "finished",
          latestRunOutcome: "completed",
          runCount: 3,
          completedRunCount: 1,
          problemRunCount: 2,
          problemRate: 2 / 3,
          latestProblemOutcome: "max_turns",
          lastCompletedOutcome: "completed",
          latestDeliveryStatus: "completed",
          latestDeliveryReportedAt: "2026-03-31T18:06:00.000Z",
          latestDeliveryRunId: "run_123",
          latestDeliveryPrUrl: "https://github.com/example/repo/pull/165",
          deliveredRunCount: 1,
          retryCount: 2,
          latestRetryAttempt: 3,
          rateLimitedCount: 1,
          maxTurnsCount: 1,
          startupFailureCount: 0,
          totalInputTokens: 6000,
          totalCachedInputTokens: 1200,
          totalOutputTokens: 2500,
          totalTokens: 9700,
          avgDurationSeconds: 420,
          avgTurns: 5,
          avgEvents: 10,
          latestErrorClass: "max_turns",
          latestErrorMessage: "Reached max turns.",
          latestActivityAt: "2026-03-31T18:05:00.000Z",
          flags: ["max_turns", "many_retries"],
          insertedAt: "2026-03-31T18:00:00.000Z",
          updatedAt: "2026-03-31T18:05:00.000Z"
        }
      ],
      totals: {
        issueCount: 1,
        runCount: 3,
        completedRunCount: 1,
        problemRunCount: 2,
        rateLimitedCount: 1,
        maxTurnsCount: 1,
        startupFailureCount: 0,
        inputTokens: 6000,
        cachedInputTokens: 1200,
        outputTokens: 2500,
        totalTokens: 9700
      },
      filters: {
        limit: null,
        repo: null,
        timeRange: "all",
        startedAfter: null,
        startedBefore: null,
        outcome: null,
        errorClass: null,
        hasFlags: [],
        sortBy: "lastActive",
        sortDirection: "desc"
      },
      facets: {
        repositories: ["symphony"],
        outcomes: ["completed", "max_turns"],
        errorClasses: ["max_turns"]
      }
    });

    expect(issueIndex.summaryCards).toHaveLength(4);
    expect(issueIndex.summaryCards[0]?.label).toBe("Total issues");
    expect(issueIndex.summaryCards[3]?.value).toBe("33.3%");
    expect(issueIndex.outcomeChartRows[0]).toEqual({
      issueIdentifier: "COL-165",
      completedRunCount: 1,
      problemRunCount: 2
    });
    expect(issueIndex.pressureChartRows[0]).toEqual({
      issueIdentifier: "COL-165",
      retryCount: 2,
      rateLimitedCount: 1,
      maxTurnsCount: 1
    });
    expect(issueIndex.rows[0]?.issueHref).toBe("/issues/COL-165?repo=symphony");
    expect(issueIndex.rows[0]?.problemRate).toBe("66.7%");
    expect(issueIndex.rows[0]?.avgDuration).toBe("7:00");
    expect(issueIndex.rows[0]?.flags).toEqual(["Max turns reached", "Many retries"]);
    expect(issueIndex.rows[0]?.lastActive).not.toBe("2026-03-31T18:05:00.000Z");
  });

  it("formats the issue drilldown rows", () => {
    const issueDetail = buildIssueDetailViewModel({
      repositoryKey: "symphony",
      issueIdentifier: "COL-165",
      runs: [
        {
          repositoryKey: "symphony",
          runId: "run_123",
          trackerIssueId: "issue_123",
          issueIdentifier: "COL-165",
          attempt: 1,
          status: "finished",
          outcome: "completed",
          agentHarness: "pi",
          agentStatus: "completed",
          agentFailureKind: null,
          agentFailureOrigin: null,
          agentFailureMessagePreview: null,
          model: "xiaomi/mimo-v2-pro",
          workerHost: "worker-a",
          workspacePath: "/tmp/workspaces/col-165",
          startedAt: "2026-03-31T18:00:00.000Z",
          endedAt: "2026-03-31T18:02:00.000Z",
          commitHashStart: "abc",
          commitHashEnd: "def",
          turnCount: 2,
          eventCount: 4,
          lastEventType: "message.output",
          lastEventAt: "2026-03-31T18:02:00.000Z",
          durationSeconds: 120,
          errorClass: null,
          errorMessage: null,
          inputTokens: 120,
          cachedInputTokens: 40,
          outputTokens: 80,
          totalTokens: 240,
          deliveryStatus: "completed",
          deliveryReportedAt: "2026-03-31T18:06:00.000Z",
          deliveryPrUrl: "https://github.com/example/repo/pull/165",
          machineLoad: null
        }
      ],
      summary: {
        runCount: 3,
        latestProblemOutcome: "max_turns",
        lastCompletedOutcome: "completed",
        latestDeliveryStatus: "completed",
        latestDeliveryReportedAt: "2026-03-31T18:06:00.000Z",
        latestDeliveryPrUrl: "https://github.com/example/repo/pull/165",
        deliveredRunCount: 1
      },
      filters: {
        limit: 200,
        repo: null
      }
    });

    expect(issueDetail.metrics[0]?.value).toBe("3");
    expect(issueDetail.outcomeChartRows[0]).toEqual({
      outcome: "Completed",
      count: 1
    });
    expect(issueDetail.tokenChartRows[0]).toEqual({
      runLabel: "#1",
      inputTokens: 120,
      cachedInputTokens: 40,
      outputTokens: 80
    });
    expect(issueDetail.failureCards[0]?.value).toBe("0");
    expect(issueDetail.recentFailureRows).toEqual([]);
    expect(issueDetail.rows[0]?.runHref).toBe(
      "/issues/COL-165/runs/run_123?repo=symphony"
    );
    expect(issueDetail.rows[0]?.durationSeconds).toBe("2:00");
    expect(issueDetail.rows[0]?.totalTokens).toBe("240");
    expect(issueDetail.machineLoadCards[0]?.value).toBe("0 / 1");
    expect(issueDetail.machineLoadCards[1]?.value).toBe("n/a");
    expect(issueDetail.machineLoadChartRows).toEqual([]);
  });

  it("rolls run machine-load summaries up into issue machine-load cards", () => {
    const issueDetail = buildIssueDetailViewModel({
      repositoryKey: "symphony",
      issueIdentifier: "COL-165",
      runs: [
        {
          repositoryKey: "symphony",
          runId: "run_123",
          trackerIssueId: "issue_123",
          issueIdentifier: "COL-165",
          attempt: 1,
          status: "finished",
          outcome: "completed",
          agentHarness: "pi",
          agentStatus: "completed",
          agentFailureKind: null,
          agentFailureOrigin: null,
          agentFailureMessagePreview: null,
          model: "xiaomi/mimo-v2-pro",
          workerHost: "worker-a",
          workspacePath: "/tmp/workspaces/col-165",
          startedAt: "2026-03-31T18:00:00.000Z",
          endedAt: "2026-03-31T18:02:00.000Z",
          commitHashStart: "abc",
          commitHashEnd: "def",
          turnCount: 2,
          eventCount: 4,
          lastEventType: "message.output",
          lastEventAt: "2026-03-31T18:02:00.000Z",
          durationSeconds: 120,
          errorClass: null,
          errorMessage: null,
          inputTokens: 120,
          cachedInputTokens: 0,
          outputTokens: 80,
          totalTokens: 200,
          deliveryStatus: "completed",
          deliveryReportedAt: "2026-03-31T18:06:00.000Z",
          deliveryPrUrl: "https://github.com/example/repo/pull/165",
          machineLoad: {
            sampleCount: 4,
            maxCpuPercent: 84,
            avgCpuPercent: 61,
            maxMemoryPercent: 72,
            avgMemoryPercent: 66,
            maxDiskPercent: 47,
            avgDiskPercent: 47,
            hadHighCpu: false,
            hadHighMemory: false,
            hadHighDisk: false
          }
        },
        {
          repositoryKey: "symphony",
          runId: "run_124",
          trackerIssueId: "issue_123",
          issueIdentifier: "COL-165",
          attempt: 2,
          status: "failed",
          outcome: "failed",
          agentHarness: "pi",
          agentStatus: "failed",
          agentFailureKind: "failed",
          agentFailureOrigin: "runtime",
          agentFailureMessagePreview: "Runtime failed.",
          model: "xiaomi/mimo-v2-pro",
          workerHost: "worker-a",
          workspacePath: "/tmp/workspaces/col-165",
          startedAt: "2026-03-31T19:00:00.000Z",
          endedAt: "2026-03-31T19:03:00.000Z",
          commitHashStart: "ghi",
          commitHashEnd: "jkl",
          turnCount: 3,
          eventCount: 8,
          lastEventType: "turn.failed",
          lastEventAt: "2026-03-31T19:03:00.000Z",
          durationSeconds: 180,
          errorClass: "failed",
          errorMessage: "Runtime failed.",
          inputTokens: 220,
          cachedInputTokens: 0,
          outputTokens: 90,
          totalTokens: 310,
          deliveryStatus: null,
          deliveryReportedAt: null,
          deliveryPrUrl: null,
          machineLoad: {
            sampleCount: 6,
            maxCpuPercent: 91,
            avgCpuPercent: 74,
            maxMemoryPercent: 85,
            avgMemoryPercent: 79,
            maxDiskPercent: 48,
            avgDiskPercent: 47,
            hadHighCpu: true,
            hadHighMemory: true,
            hadHighDisk: false
          }
        }
      ],
      summary: {
        runCount: 2,
        latestProblemOutcome: "failed",
        lastCompletedOutcome: "completed",
        latestDeliveryStatus: "completed",
        latestDeliveryReportedAt: "2026-03-31T18:06:00.000Z",
        latestDeliveryPrUrl: "https://github.com/example/repo/pull/165",
        deliveredRunCount: 1
      },
      filters: {
        limit: 200,
        repo: null
      }
    });

    expect(issueDetail.machineLoadCards).toEqual([
      {
        label: "Runs under pressure",
        value: "1 / 2",
        detail: "Runs that crossed CPU, memory, or disk high-pressure thresholds."
      },
      {
        label: "Peak CPU load",
        value: "91%",
        detail: "Highest sampled CPU pressure across this issue's runs."
      },
      {
        label: "Peak memory load",
        value: "85%",
        detail: "Highest sampled memory pressure across this issue's runs."
      },
      {
        label: "Peak disk load",
        value: "48%",
        detail: "Highest sampled disk pressure across this issue's runs."
      }
    ]);
    expect(issueDetail.machineLoadChartRows).toHaveLength(2);
    expect(issueDetail.machineLoadChartRows[0]).toMatchObject({
      runLabel: "#2",
      cpuPercent: 91,
      memoryPercent: 85,
      diskPercent: 48,
      pressureHit: true
    });
    expect(issueDetail.machineLoadChartRows[0]?.startedAt).toBeTypeOf("string");
    expect(issueDetail.machineLoadChartRows[1]).toMatchObject({
      runLabel: "#1",
      cpuPercent: 84,
      memoryPercent: 72,
      diskPercent: 47,
      pressureHit: false
    });
  });

  it("falls back to unique run labels when attempts are missing", () => {
    const issueDetail = buildIssueDetailViewModel({
      repositoryKey: "symphony",
      issueIdentifier: "COL-165",
      runs: [
        {
          repositoryKey: "symphony",
          runId: "564d183f-24ed-4c4f-be2e-06b15d2782b0",
          trackerIssueId: "issue_123",
          issueIdentifier: "COL-165",
          attempt: 0,
          status: "stopped",
          outcome: "run_stopped_terminal",
          agentHarness: "pi",
          agentStatus: "failed",
          agentFailureKind: "run_stopped_terminal",
          agentFailureOrigin: "runtime",
          agentFailureMessagePreview: "Stopped by runtime.",
          model: "xiaomi/mimo-v2-pro",
          workerHost: "worker-a",
          workspacePath: "/tmp/workspaces/col-165",
          startedAt: "2026-04-04T06:07:00.000Z",
          endedAt: "2026-04-04T06:19:00.000Z",
          commitHashStart: "abc",
          commitHashEnd: "def",
          turnCount: 5,
          eventCount: 147,
          lastEventType: "message.output",
          lastEventAt: "2026-04-04T06:19:00.000Z",
          durationSeconds: 720,
          errorClass: null,
          errorMessage: null,
          inputTokens: 10517907,
          cachedInputTokens: 0,
          outputTokens: 17501,
          totalTokens: 10535408,
          deliveryStatus: null,
          deliveryReportedAt: null,
          deliveryPrUrl: null,
          machineLoad: null
        },
        {
          repositoryKey: "symphony",
          runId: "b2122cb9-5748-4d41-92b3-29eb082ce99b",
          trackerIssueId: "issue_123",
          issueIdentifier: "COL-165",
          attempt: 0,
          status: "stopped",
          outcome: "run_stopped_inactive",
          agentHarness: "pi",
          agentStatus: "failed",
          agentFailureKind: "run_stopped_inactive",
          agentFailureOrigin: "runtime",
          agentFailureMessagePreview: "Stopped for inactivity.",
          model: "xiaomi/mimo-v2-pro",
          workerHost: "worker-a",
          workspacePath: "/tmp/workspaces/col-165",
          startedAt: "2026-04-04T05:53:00.000Z",
          endedAt: "2026-04-04T06:07:27.000Z",
          commitHashStart: "ghi",
          commitHashEnd: "jkl",
          turnCount: 1,
          eventCount: 50,
          lastEventType: "agent.stopped",
          lastEventAt: "2026-04-04T06:07:27.000Z",
          durationSeconds: 867,
          errorClass: null,
          errorMessage: null,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          deliveryStatus: null,
          deliveryReportedAt: null,
          deliveryPrUrl: null,
          machineLoad: null
        }
      ],
      summary: {
        runCount: 2,
        latestProblemOutcome: "run_stopped_terminal",
        lastCompletedOutcome: null,
        latestDeliveryStatus: null,
        latestDeliveryReportedAt: null,
        latestDeliveryPrUrl: null,
        deliveredRunCount: 0
      },
      filters: {
        limit: 200,
        repo: null
      }
    });

    expect(issueDetail.tokenChartRows).toEqual([
      {
        runLabel: "Run 2 · b2122c",
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0
      },
      {
        runLabel: "Run 1 · 564d18",
        inputTokens: 10517907,
        cachedInputTokens: 0,
        outputTokens: 17501
      }
    ]);
    expect(issueDetail.failureCards[0]?.value).toBe("2");
    expect(issueDetail.failureCards[1]?.value).toBe("Stopped by operator");
    expect(issueDetail.recentFailureRows[0]?.runHref).toBe(
      "/issues/COL-165/runs/564d183f-24ed-4c4f-be2e-06b15d2782b0?repo=symphony"
    );
  });
});
