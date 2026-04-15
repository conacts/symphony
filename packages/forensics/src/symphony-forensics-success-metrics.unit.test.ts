import { describe, expect, it } from "vitest";
import type { SymphonyForensicsRunSummary } from "@symphony/contracts";
import {
  buildSuccessMetrics,
  buildSuccessMetricWindow
} from "./symphony-forensics-success-metrics.js";

describe("symphony forensics success metrics", () => {
  it("computes executive, diagnostic, and daily delivery metrics from run summaries", () => {
    const result = buildSuccessMetrics({
      runs: [
        createRun({
          runId: "run-1",
          issueIdentifier: "COL-1",
          startedAt: "2026-04-01T10:00:00.000Z",
          deliveryStatus: "completed",
          deliveryReportedAt: "2026-04-01T10:20:00.000Z",
          deliveryPrUrl: "https://github.com/example/repo/pull/1",
          totalTokens: 100,
          cachedInputTokens: 40
        }),
        createRun({
          runId: "run-2",
          issueIdentifier: "COL-2",
          startedAt: "2026-04-02T10:00:00.000Z",
          outcome: "paused_max_turns",
          errorClass: "max_turns_reached",
          agentFailureKind: "max_turns_reached",
          totalTokens: 40,
          cachedInputTokens: 10
        }),
        createRun({
          runId: "run-3",
          issueIdentifier: "COL-3",
          startedAt: "2026-04-03T10:00:00.000Z",
          deliveryStatus: "partial",
          deliveryReportedAt: "2026-04-03T10:05:00.000Z",
          totalTokens: 60,
          cachedInputTokens: 20,
          machineLoad: {
            maxCpuPercent: 98,
            avgCpuPercent: 60,
            maxMemoryPercent: 91,
            avgMemoryPercent: 70,
            maxDiskPercent: 50,
            avgDiskPercent: 45,
            sampleCount: 4,
            hadHighCpu: true,
            hadHighMemory: true,
            hadHighDisk: false
          }
        }),
        createRun({
          runId: "run-4",
          issueIdentifier: "COL-1",
          attempt: 2,
          startedAt: "2026-04-01T10:10:00.000Z",
          deliveryStatus: "completed",
          deliveryReportedAt: "2026-04-01T10:15:00.000Z",
          deliveryPrUrl: "https://github.com/example/repo/pull/1",
          totalTokens: 50,
          cachedInputTokens: 25
        }),
        createRun({
          runId: "run-5",
          issueIdentifier: "COL-4",
          startedAt: "2026-04-04T10:00:00.000Z",
          outcome: "startup_failed",
          errorClass: "startup_failure",
          agentFailureKind: "startup_failure",
          errorMessage:
            "Run ended without recording an explicit terminal result. Non-capability-managed runs must report completion before the run can complete.",
          totalTokens: 10,
          cachedInputTokens: 0
        }),
        createRun({
          runId: "run-6",
          issueIdentifier: "COL-5",
          startedAt: "2026-04-05T10:00:00.000Z",
          outcome: "rate_limited",
          errorClass: "rate_limited",
          totalTokens: 20,
          cachedInputTokens: 5
        })
      ],
      window: buildSuccessMetricWindow({
        timeRange: "30d",
        startedAfter: "2026-04-01T00:00:00.000Z",
        startedBefore: "2026-04-05T23:59:59.999Z"
      })
    });

    expect(result.window.timeRange).toBe("30d");
    expect(result.executive).toEqual({
      startedIssueCount: 5,
      deliveredIssueCount: 1,
      issueDeliveryRate: 0.2,
      medianTokensPerDeliveredIssue: 150,
      medianTimeToDeliveredIssueSeconds: 1200,
      deliveryRetryRate: 1,
      maxTurnFailureRate: 1 / 6
    });
    expect(result.diagnostics).toEqual({
      startedRunCount: 6,
      deliveredRunCount: 2,
      blockedIssueCount: 0,
      partialIssueCount: 1,
      missingDeliveryReportFailureCount: 1,
      startupFailureRate: 1 / 6,
      rateLimitedRunRate: 1 / 6,
      highMachinePressureRunRate: 1 / 6,
      medianCachedInputShareDeliveredIssues: 65 / 150
    });
    expect(result.daily).toEqual([
      {
        date: "2026-04-01",
        startedIssueCount: 1,
        deliveredIssueCount: 1,
        startedRunCount: 2,
        deliveredRunCount: 2,
        maxTurnFailureCount: 0,
        startupFailureCount: 0,
        rateLimitedRunCount: 0,
        totalTokens: 150
      },
      {
        date: "2026-04-02",
        startedIssueCount: 1,
        deliveredIssueCount: 0,
        startedRunCount: 1,
        deliveredRunCount: 0,
        maxTurnFailureCount: 1,
        startupFailureCount: 0,
        rateLimitedRunCount: 0,
        totalTokens: 40
      },
      {
        date: "2026-04-03",
        startedIssueCount: 1,
        deliveredIssueCount: 0,
        startedRunCount: 1,
        deliveredRunCount: 0,
        maxTurnFailureCount: 0,
        startupFailureCount: 0,
        rateLimitedRunCount: 0,
        totalTokens: 60
      },
      {
        date: "2026-04-04",
        startedIssueCount: 1,
        deliveredIssueCount: 0,
        startedRunCount: 1,
        deliveredRunCount: 0,
        maxTurnFailureCount: 0,
        startupFailureCount: 1,
        rateLimitedRunCount: 0,
        totalTokens: 10
      },
      {
        date: "2026-04-05",
        startedIssueCount: 1,
        deliveredIssueCount: 0,
        startedRunCount: 1,
        deliveredRunCount: 0,
        maxTurnFailureCount: 0,
        startupFailureCount: 0,
        rateLimitedRunCount: 1,
        totalTokens: 20
      }
    ]);
  });
});

function createRun(
  overrides: Partial<SymphonyForensicsRunSummary> = {}
): SymphonyForensicsRunSummary {
  return {
    runId: "run-1",
    trackerIssueId: "issue-1",
    issueIdentifier: "COL-1",
    attempt: 1,
    status: "finished",
    outcome: "completed",
    agentHarness: "pi",
    agentStatus: "completed",
    agentFailureKind: null,
    agentFailureOrigin: null,
    agentFailureMessagePreview: null,
    workerHost: "docker-host",
    workspacePath: "/workspace/COL-1",
    startedAt: "2026-04-01T10:00:00.000Z",
    endedAt: "2026-04-01T10:10:00.000Z",
    commitHashStart: null,
    commitHashEnd: null,
    turnCount: 1,
    eventCount: 1,
    lastEventType: "turn.completed",
    lastEventAt: "2026-04-01T10:10:00.000Z",
    durationSeconds: 600,
    errorClass: null,
    errorMessage: null,
    inputTokens: 20,
    cachedInputTokens: 5,
    outputTokens: 10,
    totalTokens: 35,
    deliveryStatus: null,
    deliveryReportedAt: null,
    deliveryPrUrl: null,
    machineLoad: null,
    ...overrides
  } as SymphonyForensicsRunSummary;
}
