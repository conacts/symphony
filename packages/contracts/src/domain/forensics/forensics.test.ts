import { describe, expect, it } from "vitest";
import {
  symphonyForensicsIssueListResponseSchema,
  symphonyForensicsIssueDetailResponseSchema,
  symphonyForensicsIssueForensicsBundleResponseSchema,
  symphonyForensicsRunDetailResponseSchema,
  symphonyForensicsProblemRunsQuerySchema,
  symphonyForensicsProblemRunsResponseSchema,
  symphonyForensicsSuccessMetricsResponseSchema
} from "./index.js";

const REPOSITORY_KEY = "symphony";

describe("symphony forensics contracts", () => {
  it("parses the issue list envelope", () => {
    const parsed = symphonyForensicsIssueListResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z",
        count: 1
      },
      data: {
        issues: [
          {
            repositoryKey: REPOSITORY_KEY,
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            latestRunStartedAt: "2026-03-31T00:00:00.000Z",
            latestRunId: "run-1",
            latestRunStatus: "completed",
            latestRunOutcome: "done",
            runCount: 2,
            completedRunCount: 2,
            problemRunCount: 0,
            problemRate: 0,
            latestProblemOutcome: null,
            lastCompletedOutcome: "done",
            latestDeliveryStatus: "completed",
            latestDeliveryReportedAt: "2026-03-31T00:02:00.000Z",
            latestDeliveryRunId: "run-1",
            latestDeliveryPrUrl: "https://github.com/example/repo/pull/157",
            deliveredRunCount: 1,
            retryCount: 0,
            latestRetryAttempt: 1,
            rateLimitedCount: 0,
            maxTurnsCount: 0,
            startupFailureCount: 0,
            totalInputTokens: 10,
            totalCachedInputTokens: 2,
            totalOutputTokens: 20,
            totalTokens: 32,
            avgDurationSeconds: 60,
            avgTurns: 1,
            avgEvents: 1,
            latestErrorClass: null,
            latestErrorMessage: null,
            latestActivityAt: "2026-03-31T00:01:00.000Z",
            flags: [],
            insertedAt: "2026-03-31T00:00:00.000Z",
            updatedAt: "2026-03-31T00:00:00.000Z"
          }
        ],
        totals: {
          issueCount: 1,
          runCount: 2,
          completedRunCount: 2,
          problemRunCount: 0,
          rateLimitedCount: 0,
          maxTurnsCount: 0,
          startupFailureCount: 0,
          inputTokens: 10,
          cachedInputTokens: 2,
          outputTokens: 20,
          totalTokens: 32
        },
        filters: {
          limit: 200,
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
          repositories: [REPOSITORY_KEY],
          outcomes: ["done"],
          errorClasses: []
        }
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses the issue detail envelope", () => {
    const parsed = symphonyForensicsIssueDetailResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        repositoryKey: REPOSITORY_KEY,
        issueIdentifier: "COL-157",
        runs: [],
        summary: {
          runCount: 0,
          latestProblemOutcome: null,
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
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses the success metrics envelope", () => {
    const parsed = symphonyForensicsSuccessMetricsResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z",
        count: 2
      },
      data: {
        window: {
          timeRange: "30d",
          startedAfter: "2026-03-01T00:00:00.000Z",
          startedBefore: "2026-03-31T23:59:59.999Z"
        },
        executive: {
          startedIssueCount: 10,
          deliveredIssueCount: 6,
          issueDeliveryRate: 0.6,
          medianTokensPerDeliveredIssue: 1234,
          medianTimeToDeliveredIssueSeconds: 7200,
          deliveryRetryRate: 0.5,
          maxTurnFailureRate: 0.1
        },
        diagnostics: {
          startedRunCount: 12,
          deliveredRunCount: 6,
          blockedIssueCount: 1,
          partialIssueCount: 2,
          missingDeliveryReportFailureCount: 1,
          startupFailureRate: 0.05,
          rateLimitedRunRate: 0.08,
          highMachinePressureRunRate: 0.12,
          medianCachedInputShareDeliveredIssues: 0.45
        },
        daily: [
          {
            date: "2026-03-30",
            startedIssueCount: 2,
            deliveredIssueCount: 1,
            startedRunCount: 3,
            deliveredRunCount: 1,
            maxTurnFailureCount: 0,
            startupFailureCount: 0,
            rateLimitedRunCount: 1,
            totalTokens: 900
          },
          {
            date: "2026-03-31",
            startedIssueCount: 4,
            deliveredIssueCount: 3,
            startedRunCount: 5,
            deliveredRunCount: 3,
            maxTurnFailureCount: 1,
            startupFailureCount: 0,
            rateLimitedRunCount: 0,
            totalTokens: 1200
          }
        ]
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses the run detail envelope", () => {
    const parsed = symphonyForensicsRunDetailResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        issue: {
          repositoryKey: REPOSITORY_KEY,
          issueId: "issue-1",
          issueIdentifier: "COL-157",
          latestRunStartedAt: "2026-03-31T00:00:00.000Z",
          latestRunId: "run-1",
          latestRunStatus: "completed",
          latestRunOutcome: "done",
          runCount: 1,
          latestProblemOutcome: null,
          lastCompletedOutcome: "done",
          latestDeliveryStatus: "completed",
          latestDeliveryReportedAt: "2026-03-31T00:02:00.000Z",
          latestDeliveryRunId: "run-1",
          latestDeliveryPrUrl: "https://github.com/example/repo/pull/157",
          deliveredRunCount: 1,
          insertedAt: "2026-03-31T00:00:00.000Z",
          updatedAt: "2026-03-31T00:00:00.000Z"
        },
        run: {
          runId: "run-1",
          repositoryKey: REPOSITORY_KEY,
          issueId: "issue-1",
          issueIdentifier: "COL-157",
          attempt: 1,
          status: "completed",
          outcome: "done",
          agentStatus: "completed",
          agentFailureKind: null,
          agentFailureOrigin: null,
          agentFailureMessagePreview: null,
          model: "xiaomi/mimo-v2-pro",
          workerHost: "docker-host",
          workspacePath: "/tmp/COL-157",
          startedAt: "2026-03-31T00:00:00.000Z",
          endedAt: "2026-03-31T00:01:00.000Z",
          commitHashStart: null,
          commitHashEnd: null,
          threadId: "thread-1",
          processId: "pi-process-1",
          providerId: "openrouter",
          providerName: "OpenRouter",
          reasoningEffort: "high",
          profile: "mimo-v2-pro",
          authMode: "api_key_env",
          providerEnvKey: "OPENROUTER_API_KEY",
          launchTarget: {
            kind: "container",
            hostLaunchPath: "/tmp/COL-157",
            hostWorkspacePath: "/tmp/COL-157",
            runtimeWorkspacePath: "/workspace",
            containerId: "container-1",
            containerName: "symphony-col-157",
            shell: "sh"
          },
          turnCount: 1,
          eventCount: 1,
          lastEventType: "turn.completed",
          lastEventAt: "2026-03-31T00:01:00.000Z",
          durationSeconds: 60,
          inputTokens: 10,
          cachedInputTokens: 2,
          outputTokens: 20,
          totalTokens: 32,
          deliveryStatus: "completed",
          deliveryReportedAt: "2026-03-31T00:02:00.000Z",
          deliveryPrUrl: "https://github.com/example/repo/pull/157",
          machineLoad: null,
          repoStart: {},
          repoEnd: {},
          metadata: {},
          errorClass: null,
          errorMessage: null,
          insertedAt: "2026-03-31T00:00:00.000Z",
          updatedAt: "2026-03-31T00:01:00.000Z"
        },
        deliveryReport: {
          reportId: "report-1",
          repositoryKey: REPOSITORY_KEY,
          issueId: "issue-1",
          issueIdentifier: "COL-157",
          runId: "run-1",
          turnId: "turn-1",
          status: "completed",
          summary: "Opened the pull request.",
          prUrl: "https://github.com/example/repo/pull/157",
          prNumber: "157",
          branchName: "codex/col-157",
          blockingReason: null,
          testsSummary: "pnpm verify:precommit",
          source: "pi",
          reportedAt: "2026-03-31T00:02:00.000Z",
          insertedAt: "2026-03-31T00:02:00.000Z"
        },
        turns: [
          {
            turnId: "turn-1",
            runId: "run-1",
            turnSequence: 1,
            threadId: "thread-1",
            agentTurnId: null,
            promptText: "Implement the fix",
            status: "completed",
            startedAt: "2026-03-31T00:00:00.000Z",
            endedAt: "2026-03-31T00:01:00.000Z",
            usage: {
              input_tokens: 10,
              cached_input_tokens: 0,
              output_tokens: 20
            },
            metadata: {},
            insertedAt: "2026-03-31T00:00:00.000Z",
            updatedAt: "2026-03-31T00:01:00.000Z",
            eventCount: 1,
            events: [
              {
                eventId: "event-1",
                turnId: "turn-1",
                runId: "run-1",
                eventSequence: 1,
                eventType: "turn.completed",
                itemType: null,
                itemStatus: null,
                recordedAt: "2026-03-31T00:01:00.000Z",
                payload: {
                  type: "turn.completed",
                  usage: {
                    input_tokens: 10,
                    cached_input_tokens: 0,
                    output_tokens: 20
                  }
                },
                payloadTruncated: false,
                payloadBytes: 10,
                summary: "turn completed",
                threadId: "thread-1",
                agentTurnId: null,
                insertedAt: "2026-03-31T00:01:00.000Z"
              }
            ]
          }
        ]
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("rejects malformed agent event payloads inside run detail responses", () => {
    expect(() =>
      symphonyForensicsRunDetailResponseSchema.parse({
        schemaVersion: "1",
        ok: true,
        meta: {
          durationMs: 1,
          generatedAt: "2026-03-31T00:00:00.000Z"
        },
        data: {
          issue: {
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            latestRunStartedAt: "2026-03-31T00:00:00.000Z",
            latestRunId: "run-1",
            latestRunStatus: "completed",
            latestRunOutcome: "done",
            runCount: 1,
          latestProblemOutcome: null,
          lastCompletedOutcome: "done",
          latestDeliveryStatus: "completed",
          latestDeliveryReportedAt: "2026-03-31T00:02:00.000Z",
          latestDeliveryRunId: "run-1",
          latestDeliveryPrUrl: "https://github.com/example/repo/pull/157",
          deliveredRunCount: 1,
          insertedAt: "2026-03-31T00:00:00.000Z",
          updatedAt: "2026-03-31T00:00:00.000Z"
        },
          run: {
            runId: "run-1",
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            attempt: 1,
            status: "completed",
            outcome: "done",
            agentStatus: "completed",
            agentFailureKind: null,
            agentFailureOrigin: null,
            agentFailureMessagePreview: null,
            model: "xiaomi/mimo-v2-pro",
            workerHost: "docker-host",
            workspacePath: "/tmp/COL-157",
            startedAt: "2026-03-31T00:00:00.000Z",
            endedAt: "2026-03-31T00:01:00.000Z",
            commitHashStart: null,
            commitHashEnd: null,
            threadId: "thread-1",
            providerId: "openrouter",
            providerName: "OpenRouter",
            authMode: "api_key_env",
            providerEnvKey: "OPENROUTER_API_KEY",
            turnCount: 1,
            eventCount: 1,
            lastEventType: "item.completed",
            lastEventAt: "2026-03-31T00:01:00.000Z",
            durationSeconds: 60,
            inputTokens: 10,
            cachedInputTokens: 2,
            outputTokens: 20,
            totalTokens: 32,
            repoStart: {},
            repoEnd: {},
            metadata: {},
            errorClass: null,
          errorMessage: null,
          insertedAt: "2026-03-31T00:00:00.000Z",
          updatedAt: "2026-03-31T00:01:00.000Z"
        },
        deliveryReport: {
          reportId: "report-1",
          issueId: "issue-1",
          issueIdentifier: "COL-157",
          runId: "run-1",
          turnId: "turn-1",
          status: "completed",
          summary: "Opened the pull request.",
          prUrl: "https://github.com/example/repo/pull/157",
          prNumber: "157",
          branchName: "codex/col-157",
          blockingReason: null,
          testsSummary: "pnpm verify:precommit",
          source: "pi",
          reportedAt: "2026-03-31T00:02:00.000Z",
          insertedAt: "2026-03-31T00:02:00.000Z"
        },
        turns: [
            {
              turnId: "turn-1",
              runId: "run-1",
              turnSequence: 1,
              threadId: "thread-1",
              agentTurnId: null,
              promptText: "Implement the fix",
              status: "completed",
              startedAt: "2026-03-31T00:00:00.000Z",
              endedAt: "2026-03-31T00:01:00.000Z",
              usage: null,
              metadata: {},
              insertedAt: "2026-03-31T00:00:00.000Z",
              updatedAt: "2026-03-31T00:01:00.000Z",
              eventCount: 1,
              events: [
                {
                  eventId: "event-1",
                  turnId: "turn-1",
                  runId: "run-1",
                  eventSequence: 1,
                  eventType: "item.completed",
                  itemType: "agent_message",
                  itemStatus: null,
                  recordedAt: "2026-03-31T00:01:00.000Z",
                  payload: {
                    type: "item.completed",
                    item: {
                      type: "agent_message",
                      text: "missing the required item id"
                    }
                  },
                  payloadTruncated: false,
                  payloadBytes: 10,
                  summary: "bad event",
                  threadId: "thread-1",
                  agentTurnId: null,
                  insertedAt: "2026-03-31T00:01:00.000Z"
                }
              ]
            }
          ]
        }
      })
    ).toThrow();
  });

  it("rejects terminal runs without endedAt and durationSeconds", () => {
    expect(() =>
      symphonyForensicsRunDetailResponseSchema.parse({
        schemaVersion: "1",
        ok: true,
        meta: {
          durationMs: 1,
          generatedAt: "2026-03-31T00:00:00.000Z"
        },
        data: {
          issue: {
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            latestRunStartedAt: "2026-03-31T00:00:00.000Z",
            latestRunId: "run-1",
            latestRunStatus: "finished",
            latestRunOutcome: "done",
            runCount: 1,
            latestProblemOutcome: null,
            lastCompletedOutcome: "done",
            insertedAt: "2026-03-31T00:00:00.000Z",
            updatedAt: "2026-03-31T00:00:00.000Z"
          },
          run: {
            runId: "run-1",
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            attempt: 1,
            status: "finished",
            outcome: "done",
            workerHost: "docker-host",
            workspacePath: "/tmp/COL-157",
            startedAt: "2026-03-31T00:00:00.000Z",
            endedAt: null,
            commitHashStart: null,
            commitHashEnd: null,
            turnCount: 1,
            eventCount: 1,
            lastEventType: "turn.completed",
            lastEventAt: "2026-03-31T00:01:00.000Z",
            durationSeconds: null,
            inputTokens: 10,
            cachedInputTokens: 2,
            outputTokens: 20,
            totalTokens: 32,
            repoStart: {},
            repoEnd: {},
            metadata: {},
            errorClass: null,
            errorMessage: null,
            insertedAt: "2026-03-31T00:00:00.000Z",
            updatedAt: "2026-03-31T00:01:00.000Z"
          },
          turns: []
        }
      })
    ).toThrowError();
  });

  it("rejects runs with events that omit the canonical last event fields", () => {
    expect(() =>
      symphonyForensicsRunDetailResponseSchema.parse({
        schemaVersion: "1",
        ok: true,
        meta: {
          durationMs: 1,
          generatedAt: "2026-03-31T00:00:00.000Z"
        },
        data: {
          issue: {
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            latestRunStartedAt: "2026-03-31T00:00:00.000Z",
            latestRunId: "run-1",
            latestRunStatus: "finished",
            latestRunOutcome: "done",
            runCount: 1,
            latestProblemOutcome: null,
            lastCompletedOutcome: "done",
            insertedAt: "2026-03-31T00:00:00.000Z",
            updatedAt: "2026-03-31T00:00:00.000Z"
          },
          run: {
            runId: "run-1",
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            attempt: 1,
            status: "finished",
            outcome: "done",
            workerHost: "docker-host",
            workspacePath: "/tmp/COL-157",
            startedAt: "2026-03-31T00:00:00.000Z",
            endedAt: "2026-03-31T00:01:00.000Z",
            commitHashStart: null,
            commitHashEnd: null,
            turnCount: 1,
            eventCount: 1,
            lastEventType: null,
            lastEventAt: null,
            durationSeconds: 60,
            inputTokens: 10,
            cachedInputTokens: 2,
            outputTokens: 20,
            totalTokens: 32,
            repoStart: {},
            repoEnd: {},
            metadata: {},
            errorClass: null,
            errorMessage: null,
            insertedAt: "2026-03-31T00:00:00.000Z",
            updatedAt: "2026-03-31T00:01:00.000Z"
          },
          turns: []
        }
      })
    ).toThrowError();
  });

  it("parses the issue forensic bundle envelope", () => {
    const parsed = symphonyForensicsIssueForensicsBundleResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        repositoryKey: REPOSITORY_KEY,
        issue: {
          repositoryKey: REPOSITORY_KEY,
          issueId: "issue-1",
          issueIdentifier: "COL-157",
          latestRunStartedAt: "2026-03-31T00:00:00.000Z",
          latestRunId: "run-1",
          latestRunStatus: "completed",
          latestRunOutcome: "done",
          runCount: 2,
          completedRunCount: 2,
          problemRunCount: 0,
          problemRate: 0,
          latestProblemOutcome: null,
          lastCompletedOutcome: "done",
          latestDeliveryStatus: "completed",
          latestDeliveryReportedAt: "2026-03-31T00:02:00.000Z",
          latestDeliveryRunId: "run-1",
          latestDeliveryPrUrl: "https://github.com/example/repo/pull/157",
          deliveredRunCount: 1,
          retryCount: 0,
          latestRetryAttempt: 1,
          rateLimitedCount: 0,
          maxTurnsCount: 0,
          startupFailureCount: 0,
          totalInputTokens: 10,
          totalCachedInputTokens: 2,
          totalOutputTokens: 20,
          totalTokens: 32,
          avgDurationSeconds: 60,
          avgTurns: 1,
          avgEvents: 1,
          latestErrorClass: null,
          latestErrorMessage: null,
          latestActivityAt: "2026-03-31T00:01:00.000Z",
          flags: [],
          insertedAt: "2026-03-31T00:00:00.000Z",
          updatedAt: "2026-03-31T00:00:00.000Z"
        },
        recentRuns: [],
        distributions: {
          outcomes: {},
          errorClasses: {},
          timelineEvents: {}
        },
        latestFailure: null,
        timeline: [],
        runtimeLogs: [],
        filters: {
          limit: 200,
          repo: null,
          timeRange: "all",
          startedAfter: null,
          startedBefore: null,
          outcome: null,
          errorClass: null,
          hasFlags: [],
          sortBy: "lastActive",
          sortDirection: "desc"
        }
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses problem-run filters and envelopes", () => {
    const query = symphonyForensicsProblemRunsQuerySchema.parse({
      limit: "25",
      repo: "symphony",
      outcome: "failed",
      issueIdentifier: "COL-157"
    });

    const response = symphonyForensicsProblemRunsResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        problemRuns: [],
        problemSummary: {},
        filters: {
          repo: "symphony",
          outcome: "failed",
          issueIdentifier: "COL-157",
          limit: 25
        }
      }
    });

    expect(query.limit).toBe(25);
    expect(response.ok).toBe(true);
  });

  it("rejects forensics turns without an explicit status", () => {
    expect(() =>
      symphonyForensicsRunDetailResponseSchema.parse({
        schemaVersion: "1",
        ok: true,
        meta: {
          durationMs: 1,
          generatedAt: "2026-03-31T00:00:00.000Z"
        },
        data: {
          issue: {
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            latestRunStartedAt: "2026-03-31T00:00:00.000Z",
            latestRunId: "run-1",
            latestRunStatus: "completed",
            latestRunOutcome: "done",
            runCount: 1,
            latestProblemOutcome: null,
            lastCompletedOutcome: "done",
            insertedAt: "2026-03-31T00:00:00.000Z",
            updatedAt: "2026-03-31T00:00:00.000Z"
          },
          run: {
            runId: "run-1",
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            attempt: 1,
            status: "completed",
            outcome: "done",
            workerHost: null,
            workspacePath: null,
            startedAt: "2026-03-31T00:00:00.000Z",
            endedAt: "2026-03-31T00:01:00.000Z",
            commitHashStart: null,
            commitHashEnd: null,
            turnCount: 1,
            eventCount: 0,
            lastEventType: null,
            lastEventAt: null,
            durationSeconds: 60,
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            repoStart: null,
            repoEnd: null,
            metadata: null,
            errorClass: null,
            errorMessage: null,
            insertedAt: "2026-03-31T00:00:00.000Z",
            updatedAt: "2026-03-31T00:01:00.000Z"
          },
          turns: [
            {
              turnId: "turn-1",
              runId: "run-1",
              turnSequence: 1,
              threadId: "thread-1",
              agentTurnId: null,
              promptText: "Implement the fix",
              status: null,
              startedAt: "2026-03-31T00:00:00.000Z",
              endedAt: "2026-03-31T00:01:00.000Z",
              usage: null,
              metadata: null,
              insertedAt: "2026-03-31T00:00:00.000Z",
              updatedAt: "2026-03-31T00:01:00.000Z",
              eventCount: 0,
              events: []
            }
          ]
        }
      })
    ).toThrow();
  });
});
