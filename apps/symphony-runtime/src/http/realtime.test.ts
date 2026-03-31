import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  createFileBackedSymphonyRunJournal,
  createMemorySymphonyTracker,
  createSymphonyForensicsReadModel,
  SymphonyGithubReviewProcessor,
  type SymphonyLoadedWorkflow,
  type SymphonyOrchestratorSnapshot,
  type SymphonyResolvedWorkflowConfig,
  type SymphonyRunFinishAttrs,
  type SymphonyRunStartAttrs,
  type SymphonyTurnFinishAttrs,
  type SymphonyTurnStartAttrs,
  type SymphonyEventAttrs,
  type SymphonyTrackerIssue
} from "@symphony/core";
import { createSymphonyRuntimeApplication } from "./app.js";
import { createSymphonyGitHubReviewIngressService } from "../core/github-review-ingress.js";
import { createSymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";
import type { SymphonyRuntimeAppServices } from "../core/runtime-services.js";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "symphony-runtime-ws-"));
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

describe("@symphony/runtime realtime websocket", () => {
  it("acks subscriptions and pushes typed invalidation updates", async () => {
    const services = await createRealtimeServices();
    const runtimeApplication = createSymphonyRuntimeApplication(services);
    const httpServer = await awaitableServer(runtimeApplication);
    const address = httpServer.address() as AddressInfo;
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/v1/ws`);
    const messages: unknown[] = [];

    socket.on("message", (data: WebSocket.RawData) => {
      messages.push(JSON.parse(data.toString()));
    });

    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    await waitForMessageCount(messages, 1);

    socket.send(
      JSON.stringify({
        type: "subscribe",
        channels: ["runtime", "issues", "problem-runs"]
      })
    );
    await waitForMessageCount(messages, 2);

    services.realtime.publishSnapshotUpdated();
    services.realtime.publishIssueUpdated("COL-123");
    services.realtime.publishProblemRunsUpdated();
    socket.send(JSON.stringify({ type: "ping", id: "ping-1" }));
    await waitForMessageCount(messages, 6);

    expect(messages).toEqual([
      expect.objectContaining({
        type: "connection.ack",
        subscribedChannels: []
      }),
      expect.objectContaining({
        type: "connection.ack",
        subscribedChannels: ["issues", "problem-runs", "runtime"]
      }),
      expect.objectContaining({
        type: "runtime.snapshot.updated",
        invalidate: ["/api/v1/state"]
      }),
      expect.objectContaining({
        type: "issue.updated",
        issueIdentifier: "COL-123"
      }),
      expect.objectContaining({
        type: "problem-runs.updated",
        invalidate: ["/api/v1/problem-runs"]
      }),
      expect.objectContaining({
        type: "pong",
        id: "ping-1"
      })
    ]);

    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.close();
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  });
});

async function awaitableServer(
  runtimeApplication: ReturnType<typeof createSymphonyRuntimeApplication>
) {
  const { createAdaptorServer } = await import("@hono/node-server");
  const server = createAdaptorServer({
    fetch: runtimeApplication.app.fetch
  });

  runtimeApplication.nodeWebSocket.injectWebSocket(server);

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return server;
}

async function waitForMessageCount(
  messages: unknown[],
  count: number
): Promise<void> {
  const startedAt = Date.now();

  while (messages.length < count) {
    if (Date.now() - startedAt > 5_000) {
      throw new Error(`Timed out waiting for ${count} websocket messages.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function createRealtimeServices(): Promise<SymphonyRuntimeAppServices> {
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
  await runJournal.finalizeRun(runId, buildRunFinishAttrs());

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
    realtime: createSymphonyRealtimeHub({
      now: () => new Date("2026-03-31T00:00:00.000Z")
    })
  };
}

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
