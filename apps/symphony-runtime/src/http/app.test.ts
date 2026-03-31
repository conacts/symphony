import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFileBackedSymphonyRunJournal,
  createMemorySymphonyTracker,
  createSymphonyForensicsReadModel,
  SymphonyGithubReviewProcessor,
  type SymphonyLoadedWorkflow,
  type SymphonyOrchestratorSnapshot
} from "@symphony/core";
import type {
  SymphonyResolvedWorkflowConfig,
  SymphonyRunStartAttrs,
  SymphonyRunFinishAttrs,
  SymphonyTurnStartAttrs,
  SymphonyTurnFinishAttrs,
  SymphonyEventAttrs,
  SymphonyTrackerIssue
} from "@symphony/core";
import { createSymphonyRuntimeApp } from "./app.js";
import { createSymphonyGitHubReviewIngressService } from "../core/github-review-ingress.js";
import type { SymphonyRuntimeAppServices } from "../core/runtime-services.js";
import { createSymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "symphony-runtime-app-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

function buildSnapshot(
  overrides: Partial<SymphonyOrchestratorSnapshot> = {}
): SymphonyOrchestratorSnapshot {
  return {
    running: [],
    retrying: [],
    claimedIssueIds: [],
    completedIssueIds: [],
    pollIntervalMs: 5_000,
    maxConcurrentAgents: 10,
    nextPollDueAtMs: null,
    pollCheckInProgress: false,
    codexTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0
    },
    ...overrides
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createServices(): Promise<SymphonyRuntimeAppServices> {
  const root = await createTempDirectory();
  const workflowConfig = buildWorkflowConfig(root);
  const issue = buildTrackerIssue({
    state: "In Review"
  });
  const tracker = createMemorySymphonyTracker([issue]);
  const runJournal = createFileBackedSymphonyRunJournal({
    dbFile: path.join(root, "run-journal.json")
  });
  const runId = await runJournal.recordRunStarted(
    buildRunStartAttrs({
      issueId: issue.id,
      issueIdentifier: issue.identifier
    })
  );
  const turnId = await runJournal.recordTurnStarted(
    runId,
    buildTurnStartAttrs()
  );
  await runJournal.recordEvent(runId, turnId, buildEventAttrs());
  await runJournal.finalizeTurn(turnId, buildTurnFinishAttrs());
  await runJournal.finalizeRun(
    runId,
    buildRunFinishAttrs()
  );

  const snapshot = buildSnapshot({
    running: [
      {
        issueId: issue.id,
        issue: {
          ...issue,
          state: "In Progress"
        },
        sessionId: "thread-live",
        workerHost: null,
        workspacePath: path.join(root, "symphony-COL-123"),
        retryAttempt: 0,
        turnCount: 1,
        lastCodexMessage: {
          event: "notification",
          message: {
            method: "thread/tokenUsage/updated"
          },
          timestamp: "2026-03-31T00:00:00.000Z"
        },
        lastCodexTimestamp: "2026-03-31T00:00:00.000Z",
        lastCodexEvent: "notification",
        codexInputTokens: 12,
        codexOutputTokens: 4,
        codexTotalTokens: 16,
        codexLastReportedInputTokens: 12,
        codexLastReportedOutputTokens: 4,
        codexLastReportedTotalTokens: 16,
        codexAppServerPid: "4242",
        startedAt: "2026-03-31T00:00:00.000Z",
        runtimeSeconds: 12
      }
    ]
  });

  return {
    workflow: buildLoadedWorkflow(workflowConfig),
    workflowConfig,
    tracker,
    orchestrator: {
      snapshot() {
        return snapshot;
      },
      async runPollCycle() {
        return snapshot;
      }
    },
    forensics: createSymphonyForensicsReadModel(runJournal),
    githubReviewIngress: createSymphonyGitHubReviewIngressService({
      workflowConfig,
      reviewProcessor: new SymphonyGithubReviewProcessor({
        workflowConfig,
        tracker,
        pullRequestResolver: {
          async fetchPullRequest() {
            return {
              headRef: "symphony/COL-123",
              htmlUrl: "https://github.com/openai/symphony/pull/123"
            };
          }
        }
      })
    }),
    realtime: createSymphonyRealtimeHub()
  };
}

function buildWorkflowConfig(root: string): SymphonyResolvedWorkflowConfig {
  return {
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      projectSlug: "coldets",
      teamKey: null,
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "In Progress", "Rework"],
      terminalStates: ["Canceled", "Duplicate", "Done"],
      claimTransitionToState: "In Progress",
      claimTransitionFromStates: ["Todo", "Rework"],
      startupFailureTransitionToState: "Backlog"
    },
    polling: {
      intervalMs: 5_000
    },
    workspace: {
      root
    },
    worker: {
      sshHosts: [],
      maxConcurrentAgentsPerHost: null
    },
    agent: {
      maxConcurrentAgents: 10,
      maxTurns: 20,
      maxRetryBackoffMs: 300_000,
      maxConcurrentAgentsByState: {}
    },
    codex: {
      command: "codex app-server",
      approvalPolicy: {
        reject: {
          sandbox_approval: true
        }
      },
      threadSandbox: "workspace-write",
      turnSandboxPolicy: null,
      turnTimeoutMs: 3_600_000,
      readTimeoutMs: 5_000,
      stallTimeoutMs: 300_000
    },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60_000
    },
    observability: {
      dashboardEnabled: true,
      refreshMs: 1_000,
      renderIntervalMs: 16
    },
    server: {
      port: null,
      host: "0.0.0.0"
    },
    github: {
      repo: "openai/symphony",
      webhookSecret: "secret",
      apiToken: null,
      statePath: path.join(root, "github-state.json"),
      allowedReviewLogins: ["reviewer"],
      allowedReworkCommentLogins: ["reviewer"]
    }
  };
}

function buildTrackerIssue(
  overrides: Partial<SymphonyTrackerIssue> = {}
): SymphonyTrackerIssue {
  return {
    id: "issue-123",
    identifier: "COL-123",
    title: "Test issue",
    description: "Test description",
    priority: 2,
    state: "Todo",
    branchName: "symphony/COL-123",
    url: "https://linear.app/coldets/issue/col-123",
    projectId: "project-1",
    projectName: "Symphony Developer Control Plane Foundation",
    projectSlug: "symphony-developer-control-plane-foundation",
    teamKey: "COL",
    assigneeId: "worker-1",
    blockedBy: [],
    labels: [],
    assignedToWorker: true,
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:00:00.000Z",
    ...overrides
  };
}

function buildLoadedWorkflow(
  config: SymphonyResolvedWorkflowConfig
): SymphonyLoadedWorkflow {
  return {
    rawConfig: {},
    config,
    prompt: "Prompt",
    promptTemplate: "Prompt",
    sourcePath: null
  };
}

function buildRunStartAttrs(
  overrides: Partial<SymphonyRunStartAttrs> = {}
): SymphonyRunStartAttrs {
  return {
    issueId: "issue-123",
    issueIdentifier: "COL-123",
    runId: "run-123",
    attempt: 1,
    status: "running",
    workerHost: null,
    workspacePath: null,
    startedAt: "2026-03-31T00:00:00.000Z",
    commitHashStart: null,
    repoStart: null,
    metadata: null,
    ...overrides
  };
}

function buildTurnStartAttrs(
  overrides: Partial<SymphonyTurnStartAttrs> = {}
): SymphonyTurnStartAttrs {
  return {
    turnId: "turn-123",
    turnSequence: 1,
    codexThreadId: null,
    codexTurnId: null,
    codexSessionId: null,
    promptText: "Prompt",
    status: "running",
    startedAt: "2026-03-31T00:00:00.000Z",
    metadata: null,
    ...overrides
  };
}

function buildEventAttrs(
  overrides: Partial<SymphonyEventAttrs> = {}
): SymphonyEventAttrs {
  return {
    eventId: "event-123",
    eventSequence: 1,
    eventType: "notification",
    recordedAt: "2026-03-31T00:00:01.000Z",
    payload: {
      method: "thread/tokenUsage/updated"
    },
    summary: "notification",
    codexThreadId: null,
    codexTurnId: null,
    codexSessionId: null,
    ...overrides
  };
}

function buildTurnFinishAttrs(
  overrides: Partial<SymphonyTurnFinishAttrs> = {}
): SymphonyTurnFinishAttrs {
  return {
    status: "completed",
    endedAt: "2026-03-31T00:00:02.000Z",
    codexThreadId: null,
    codexTurnId: null,
    codexSessionId: null,
    tokens: null,
    metadata: null,
    ...overrides
  };
}

function buildRunFinishAttrs(
  overrides: Partial<SymphonyRunFinishAttrs> = {}
): SymphonyRunFinishAttrs {
  return {
    status: "finished",
    outcome: "paused_max_turns",
    endedAt: "2026-03-31T00:00:03.000Z",
    commitHashEnd: null,
    repoEnd: null,
    metadata: null,
    errorClass: null,
    errorMessage: null,
    ...overrides
  };
}

describe("@symphony/runtime app", () => {
  it("serves the runtime state and refresh surfaces", async () => {
    const app = createSymphonyRuntimeApp(await createServices());

    const stateResponse = await app.request("/api/v1/state");
    const refreshResponse = await app.request("/api/v1/refresh", {
      method: "POST"
    });
    const statePayload = await responseJson<{
      data: {
        running: Array<{
          sessionId: string | null;
        }>;
      };
    }>(stateResponse);
    const refreshPayload = await responseJson<{
      data: {
        operations: [string, string];
      };
    }>(refreshResponse);

    expect(stateResponse.status).toBe(200);
    expect(statePayload.data.running[0]?.sessionId).toBe("thread-live");

    expect(refreshResponse.status).toBe(202);
    expect(refreshPayload.data.operations).toEqual(["poll", "reconcile"]);
  });

  it("serves forensics routes and the runtime issue detail route", async () => {
    const app = createSymphonyRuntimeApp(await createServices());

    const issuesResponse = await app.request("/api/v1/issues");
    const issueDetailResponse = await app.request("/api/v1/issues/COL-123");
    const runDetailResponse = await app.request("/api/v1/runs/run-123");
    const problemRunsResponse = await app.request("/api/v1/problem-runs");
    const runtimeIssueResponse = await app.request("/api/v1/COL-123");
    const issuesPayload = await responseJson<{
      data: {
        issues: Array<{
          issueIdentifier: string;
        }>;
      };
    }>(issuesResponse);
    const issueDetailPayload = await responseJson<{
      data: {
        issueIdentifier: string;
      };
    }>(issueDetailResponse);
    const runDetailPayload = await responseJson<{
      data: {
        run: {
          runId: string;
        };
      };
    }>(runDetailResponse);
    const problemRunsPayload = await responseJson<{
      data: {
        problemRuns: unknown[];
      };
    }>(problemRunsResponse);
    const runtimeIssuePayload = await responseJson<{
      data: {
        issueIdentifier: string;
        tracked: {
          url: string | null;
        };
        operator: {
          githubPullRequestSearchUrl: string | null;
          requeueCommand: string;
        };
      };
    }>(runtimeIssueResponse);

    expect(issuesResponse.status).toBe(200);
    expect(issuesPayload.data.issues[0]?.issueIdentifier).toBe("COL-123");

    expect(issueDetailResponse.status).toBe(200);
    expect(issueDetailPayload.data.issueIdentifier).toBe("COL-123");

    expect(runDetailResponse.status).toBe(200);
    expect(runDetailPayload.data.run.runId).toBe("run-123");

    expect(problemRunsResponse.status).toBe(200);
    expect(Array.isArray(problemRunsPayload.data.problemRuns)).toBe(true);

    expect(runtimeIssueResponse.status).toBe(200);
    expect(runtimeIssuePayload.data.issueIdentifier).toBe("COL-123");
    expect(runtimeIssuePayload.data.tracked.url).toBe(
      "https://linear.app/coldets/issue/col-123"
    );
    expect(runtimeIssuePayload.data.operator.githubPullRequestSearchUrl).toContain(
      "github.com/openai/symphony/pulls"
    );
    expect(runtimeIssuePayload.data.operator.requeueCommand).toBe("/rework");
  });

  it("fails closed on invalid params and ingests GitHub review events", async () => {
    const app = createSymphonyRuntimeApp(await createServices());
    const rawBody = JSON.stringify({
      repository: {
        full_name: "openai/symphony"
      },
      action: "submitted",
      pull_request: {
        number: 123,
        head: {
          sha: "abc123",
          ref: "symphony/COL-123"
        },
        url: "https://api.github.com/repos/openai/symphony/pulls/123",
        html_url: "https://github.com/openai/symphony/pull/123"
      },
      review: {
        id: 999,
        state: "changes_requested",
        user: {
          login: "reviewer"
        }
      }
    });
    const signature = await import("node:crypto").then(({ createHmac }) =>
      `sha256=${createHmac("sha256", "secret").update(rawBody).digest("hex")}`
    );

    const invalidResponse = await app.request("/api/v1/issues?limit=0");
    const ingressResponse = await app.request("/api/v1/github/review-events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-1",
        "x-github-event": "pull_request_review",
        "x-hub-signature-256": signature
      },
      body: rawBody
    });
    const invalidPayload = await responseJson<{
      error: {
        code: string;
      };
    }>(invalidResponse);
    const ingressPayload = await responseJson<{
      data: {
        accepted: boolean;
      };
    }>(ingressResponse);

    expect(invalidResponse.status).toBe(400);
    expect(invalidPayload.error.code).toBe("VALIDATION_FAILED");

    expect(ingressResponse.status).toBe(202);
    expect(ingressPayload.data.accepted).toBe(true);
  });
});
