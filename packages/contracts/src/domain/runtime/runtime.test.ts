import { describe, expect, it } from "vitest";
import {
  symphonyRuntimeIssuePathSchema,
  symphonyRuntimeIssueResponseSchema,
  symphonyRuntimeRefreshRequestSchema,
  symphonyRuntimeRefreshResponseSchema,
  symphonyRuntimeStateResponseSchema
} from "./index.js";

describe("symphony runtime contracts", () => {
  it("parses the runtime state envelope", () => {
    const parsed = symphonyRuntimeStateResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        counts: { running: 1, retrying: 1 },
        running: [
          {
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            state: "In Progress",
            workerHost: "local",
            workspacePath: "/tmp/COL-157",
            sessionId: "session-1",
            workspace: {
              backendKind: "local",
              workerHost: "local",
              prepareDisposition: "reused",
              executionTargetKind: "host_path",
              materializationKind: "directory",
              containerDisposition: "not_applicable",
              hostPath: "/tmp/COL-157",
              runtimePath: "/tmp/COL-157",
              containerId: null,
              containerName: null,
              path: "/tmp/COL-157",
              executionTarget: {
                kind: "host_path",
                path: "/tmp/COL-157"
              },
              materialization: {
                kind: "directory",
                hostPath: "/tmp/COL-157"
              }
            },
            launchTarget: {
              kind: "host_path",
              hostWorkspacePath: "/tmp/COL-157",
              runtimeWorkspacePath: "/tmp/COL-157"
            },
            turnCount: 3,
            lastEvent: "notification",
            lastMessage: "Working on tests",
            startedAt: "2026-03-31T00:00:00.000Z",
            lastEventAt: "2026-03-31T00:00:01.000Z",
            tokens: {
              inputTokens: 1,
              outputTokens: 2,
              totalTokens: 3
            }
          }
        ],
        retrying: [
          {
            issueId: "issue-2",
            issueIdentifier: "COL-158",
            attempt: 2,
            dueAt: "2026-03-31T00:00:05.000Z",
            error: "no available orchestrator slots",
            workerHost: null,
            workspacePath: null,
            workspace: null,
            launchTarget: null
          }
        ],
        codexTotals: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          secondsRunning: 45
        },
        rateLimits: {
          primary: {
            remaining: 10
          }
        }
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses the runtime issue detail envelope", () => {
    const parsed = symphonyRuntimeIssueResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 2,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        issueIdentifier: "COL-157",
        issueId: "issue-1",
        status: "running",
        workspace: {
          backendKind: "local",
          workerHost: "local",
          prepareDisposition: "reused",
          executionTargetKind: "host_path",
          materializationKind: "directory",
          containerDisposition: "not_applicable",
          hostPath: "/tmp/COL-157",
          runtimePath: "/tmp/COL-157",
          containerId: null,
          containerName: null,
          path: "/tmp/COL-157",
          executionTarget: {
            kind: "host_path",
            path: "/tmp/COL-157"
          },
          materialization: {
            kind: "directory",
            hostPath: "/tmp/COL-157"
          }
        },
        attempts: {
          restartCount: 0,
          currentRetryAttempt: 0
        },
        running: {
          workerHost: "local",
          workspacePath: "/tmp/COL-157",
          sessionId: "session-1",
          launchTarget: {
            kind: "host_path",
            hostWorkspacePath: "/tmp/COL-157",
            runtimeWorkspacePath: "/tmp/COL-157"
          },
          turnCount: 3,
          state: "In Progress",
          startedAt: "2026-03-31T00:00:00.000Z",
          lastEvent: "notification",
          lastMessage: "Working on tests",
          lastEventAt: "2026-03-31T00:00:01.000Z",
          tokens: {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3
          }
        },
        retry: null,
        lastError: null,
        tracked: {
          title: "Rebuild the runtime summary",
          state: "In Progress",
          branchName: "symphony/COL-157",
          url: "https://linear.app/coldets/issue/COL-157/runtime-summary",
          projectName: "Symphony",
          projectSlug: "symphony",
          teamKey: "COL"
        },
        operator: {
          refreshPath: "/api/v1/refresh",
          refreshDelegatesTo: ["poll", "reconcile"],
          githubPullRequestSearchUrl:
            "https://github.com/openai/symphony/pulls?q=is%3Apr+head%3Asymphony%2FCOL-157",
          requeueDelegatesTo: ["linear", "github_rework_comment"],
          requeueCommand: "/rework",
          requeueHelpText:
            "Use /rework on the PR or move the Linear issue back into a dispatchable state."
        }
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses tracker-only runtime issue context", () => {
    const parsed = symphonyRuntimeIssueResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 2,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        issueIdentifier: "COL-106",
        issueId: "issue-106",
        status: "tracked",
        workspace: {
          backendKind: null,
          workerHost: null,
          prepareDisposition: null,
          executionTargetKind: null,
          materializationKind: null,
          containerDisposition: null,
          hostPath: null,
          runtimePath: null,
          containerId: null,
          containerName: null,
          path: null,
          executionTarget: null,
          materialization: null
        },
        attempts: {
          restartCount: 0,
          currentRetryAttempt: 0
        },
        running: null,
        retry: null,
        lastError: null,
        tracked: {
          title: "Historical issue",
          state: "Done",
          branchName: "symphony/COL-106",
          url: "https://linear.app/coldets/issue/COL-106/historical-issue",
          projectName: "Symphony",
          projectSlug: "symphony",
          teamKey: "COL"
        },
        operator: {
          refreshPath: "/api/v1/refresh",
          refreshDelegatesTo: ["poll", "reconcile"],
          githubPullRequestSearchUrl:
            "https://github.com/openai/symphony/pulls?q=is%3Apr+head%3Asymphony%2FCOL-106",
          requeueDelegatesTo: ["linear", "github_rework_comment"],
          requeueCommand: "/rework",
          requeueHelpText:
            "Use /rework on the PR or move the Linear issue back into a dispatchable state."
        }
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses refresh requests and responses", () => {
    const request = symphonyRuntimeRefreshRequestSchema.parse({});
    const response = symphonyRuntimeRefreshResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 0,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        queued: true,
        coalesced: false,
        requestedAt: "2026-03-31T00:00:00.000Z",
        operations: ["poll", "reconcile"]
      }
    });

    expect(request).toEqual({});
    expect(response.ok).toBe(true);
  });

  it("rejects blank runtime issue identifiers", () => {
    expect(() =>
      symphonyRuntimeIssuePathSchema.parse({
        issueIdentifier: "   "
      })
    ).toThrowError();
  });
});
