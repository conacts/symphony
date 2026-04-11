import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSqliteAgentAnalyticsReadStore,
  createSqliteAgentAnalyticsStore,
  createRouteWorkflowStore,
  createSymphonyIssueDeliveryReportStore,
  createSymphonyIssueStore,
  createSqliteSymphonyRuntimeRunStore,
  initializeSymphonyDb,
  symphonySchema
} from "@symphony/db";
import { createSilentSymphonyLogger } from "@symphony/logger";
import type { SymphonyAgentRuntimeCompletion } from "@symphony/orchestrator";
import {
  type SymphonyReworkHandoff,
  symphonyHarnessPromptAppendix
} from "@symphony/runtime-contract";
import type { RuntimeMergeResult } from "@symphony/runtime-tools";
import {
  type WorkflowSignal
} from "@symphony/router";
import {
  buildRuntimeMergeResult,
  buildSymphonyReworkHandoff
} from "@symphony/test-support";
import type {
  SymphonyTracker,
  SymphonyTrackerConfig,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import {
  createSymphonyAgentRuntime as createRawSymphonyAgentRuntime,
  isTransientProviderError
} from "./agent-harness-runtime.js";
import { createRuntimeCurrentFlowRouting } from "./runtime-workflow-presets.js";
import { createRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import { buildSymphonyRuntimeTrackerIssue, buildSymphonyRuntimePolicyForRoot } from "../test-support/create-symphony-runtime-test-harness.js";

const tempRoots: string[] = [];
const execFileAsync = promisify(execFile);
const originalPath = process.env.PATH;
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
const testRepositoryKey = "openai/symphony";

function createSymphonyAgentRuntime(
  input: Parameters<typeof createRawSymphonyAgentRuntime>[0]
) {
  return createRawSymphonyAgentRuntime({
    githubRepository: testRepositoryKey,
    ...input
  });
}

async function seedCanonicalIssue(
  db: ReturnType<typeof initializeSymphonyDb>["db"],
  issue: SymphonyTrackerIssue
): Promise<void> {
  const issueStore = createSymphonyIssueStore(db);
  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: testRepositoryKey,
    latestRunStartedAt: null,
    recordedAt: "2026-03-31T00:00:00.000Z"
  });
}

afterEach(async () => {
  process.env.PATH = originalPath;
  if (originalOpenRouterKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
  }
  delete process.env.SYMPHONY_TEST_FAKE_DOCKER_LOG;
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("docker pi symphony agent runtime", () => {
  it("runs a real SDK turn and records typed turn events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-runtime-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);
    await writeFile(path.join(workspacePath, "tracked.txt"), "hello world\nchanged\n");

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(
      fakeDocker,
      path.join(root, "fake-docker-log.json")
    );
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "In Review");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const agentReadStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "rework",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    const updates: string[] = [];
    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(
          root,
          "You are working on {{ issue.identifier }} in {{ repo.name }} on {{ repo.default_branch }}."
        ),
        tracker,
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate(_issueId, update) {
            updates.push(update.event);
          },
          async onComplete(_issueId, result) {
            completion = result;
            await runStore.finalizeRun(runId, {
              status: "finished",
              outcome:
                result.kind === "delivered"
                  ? "completed"
                  : result.kind === "merged"
                    ? "merged"
                    : "failed",
              endedAt: new Date().toISOString()
            });
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "rework",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "failure",
      reason: expect.stringContaining("symphony tool finish")
    });
    expect(updates).toContain("thread.started");
    expect(updates).toContain("item.completed");

    const runDetail = await agentReadStore.fetchRunDetail(runId);
    expect(runDetail?.turns).toHaveLength(1);
    expect(runDetail?.turns[0]?.promptText).toBe(
      `You are working on COL-123 in symphony on main.\n\n${symphonyHarnessPromptAppendix}`
    );
    expect(
      runDetail?.turns[0]?.events.map((event: { eventType: string }) => event.eventType)
    ).toEqual([
      "thread.started",
      "item.completed"
    ]);
    const canonicalEvents = database.db
      .select()
      .from(symphonySchema.symphonyEventsTable)
      .all()
      .filter((event) => event.runId === runId)
      .sort((left, right) => left.eventSequence - right.eventSequence);
    expect(canonicalEvents.map((event) => event.eventType)).toEqual([
      "session.started",
      "thread.started",
      "item.completed"
    ]);
    expect(canonicalEvents[0]).toMatchObject({
      summary: "Runtime session started.",
      threadId: expect.any(String),
      payload: expect.objectContaining({
        type: "session.started"
      })
    });
    expect(runDetail?.run.commitHashStart).toMatch(/[0-9a-f]{40}/);
    expect(runDetail?.run.commitHashEnd).toMatch(/[0-9a-f]{40}/);
    expect(runDetail?.run.repoStart).toMatchObject({
      available: true,
      dirty: true
    });
    expect(runDetail?.run.repoEnd).toMatchObject({
      available: true,
      dirty: true
    });

    database.close();
  });

  it("forwards raw pi usage payloads through runtime updates", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-usage-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(
      fakePi,
      `#!/bin/sh
session_id="pi-session-1"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  id="$(printf '%s\\n' "$line" | sed -E 's/.*"id":"([^"]+)".*/\\1/')"
  command="$(printf '%s\\n' "$line" | sed -E 's/.*"type":"([^"]+)".*/\\1/')"

  if [ "$command" = "get_state" ]; then
    printf '%s\\n' '{"id":"'"$id"'","type":"response","success":true,"data":{"sessionId":"'"$session_id"'","model":{"id":"x","provider":"openrouter"}}}'
    continue
  fi

  if [ "$command" = "prompt" ]; then
    printf '%s\\n' '{"id":"'"$id"'","type":"response","success":true}'
    printf '%s\\n' '{"type":"message_end","message":{"responseId":"msg-1","role":"assistant","content":[{"type":"text","text":"ok"}],"usage":{"input":5,"cacheRead":0,"output":2}}}'
    printf '%s\\n' '{"type":"turn_end","message":{"usage":{"input":5,"cacheRead":0,"output":2}}}'
    printf '%s\\n' '{"type":"agent_end"}'
    continue
  fi
done
`
    );
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(
      fakeDocker,
      path.join(root, "fake-docker-log.json")
    );
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "In Progress");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "implementation",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    const payloads: unknown[] = [];

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker,
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate(_issueId, update) {
            payloads.push(update.payload ?? null);
          },
          async onComplete() {
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(payloads).toContainEqual(
      expect.objectContaining({
        type: "message_end",
        message: expect.objectContaining({
          usage: expect.objectContaining({
            input: 5,
            output: 2
          })
        })
      })
    );
    expect(payloads).toContainEqual(
      expect.objectContaining({
        type: "turn_end",
        message: expect.objectContaining({
          usage: expect.objectContaining({
            input: 5,
            output: 2
          })
        })
      })
    );

    database.close();
  });

  it("completes implementation runs when delivery is recorded through persisted run state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-delivery-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(
      fakeDocker,
      path.join(root, "fake-docker-log.json")
    );
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "In Progress");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "implementation",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;
    let deliveryRecorded = false;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker,
        runStore,
        deliveryReports,
        loadCurrentWorkflowTrackerState: async () => "In Review",
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            if (deliveryRecorded) {
              return;
            }

            deliveryRecorded = true;
            await deliveryReports.record({
              runId,
              reportId: [runId, "delivery"].join("-"),
              reportedAt: "2026-03-31T00:05:00.000Z",
              status: "completed",
              summary: "Opened the PR and finished the requested work.",
              prUrl: "https://github.com/openai/symphony/pull/123",
              branchName: "symphony/col-123",
              source: "pi"
            });
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "delivered"
    });

    database.close();
  });

  it("fails completed delivery reports that never move the issue to In Review", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-delivery-transition-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "In Review");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "implementation",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;
    let deliveryRecorded = false;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker,
        runStore,
        deliveryReports,
        loadCurrentWorkflowTrackerState: async () => "In Progress",
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            if (deliveryRecorded) {
              return;
            }

            deliveryRecorded = true;
            await deliveryReports.record({
              runId,
              reportId: [runId, "delivery"].join("-"),
              reportedAt: "2026-03-31T00:05:00.000Z",
              status: "completed",
              summary: "Opened the PR and finished the requested work.",
              prUrl: "https://github.com/openai/symphony/pull/123",
              branchName: "symphony/col-123",
              source: "pi"
            });
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "failure",
      reason: expect.stringContaining("did not reach `In Review`")
    });

    database.close();
  });

  it("emits blocked when a delivery report records a repo-owned blocker", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-delivery-blocked-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "In Progress");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "implementation",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;
    let deliveryRecorded = false;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker,
        runStore,
        deliveryReports,
        loadCurrentWorkflowTrackerState: async () => "Blocked",
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            if (deliveryRecorded) {
              return;
            }

            deliveryRecorded = true;
            await deliveryReports.record({
              runId,
              reportId: [runId, "delivery"].join("-"),
              reportedAt: "2026-03-31T00:05:00.000Z",
              status: "blocked",
              summary: "Blocked by a repository-owned environment contract.",
              blockingReason: "Missing required repo credentials for integration tests.",
              source: "pi"
            });
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "blocked",
      reason: "Missing required repo credentials for integration tests."
    });

    database.close();
  });

  it("records Pi turn diagnostics in runtime failure logs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-pi-diagnostics-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(
      fakePi,
      `#!/bin/sh
session_id="pi-session-1"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  id="$(printf '%s\\n' "$line" | sed -E 's/.*"id":"([^"]+)".*/\\1/')"
  command="$(printf '%s\\n' "$line" | sed -E 's/.*"type":"([^"]+)".*/\\1/')"

  if [ "$command" = "get_state" ]; then
    printf '%s\\n' '{"id":"'"$id"'","type":"response","success":true,"data":{"sessionId":"'"$session_id"'","model":{"id":"x","provider":"openrouter"},"isStreaming":false,"pendingMessageCount":0,"messageCount":1}}'
    continue
  fi

  if [ "$command" = "prompt" ]; then
    printf '%s\\n' '{"id":"'"$id"'","type":"response","success":true}'
    printf '%s\\n' 'Error: 402 Provider returned error' >&2
    printf '%s\\n' '{"error":{"code":"402","message":"Insufficient account balance","type":"insufficient_balance"}}' >&2
    printf '%s\\n' '{"type":"queue_update","followUp":["continue"],"tasks":[{"content":"continue"}]}'
    printf '%s\\n' '{"type":"agent_end"}'
    continue
  fi
done
`
    );
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(
      fakeDocker,
      path.join(root, "fake-docker-log.json")
    );
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "Blocked");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });

    const runtimeLogPayloads: Array<Record<string, unknown> | null | undefined> = [];
    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker,
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record(input) {
            runtimeLogPayloads.push(
              input.payload && typeof input.payload === "object"
                ? (input.payload as Record<string, unknown>)
                : null
            );
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId: null,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "failure",
      reason: "Pi ended the turn after emitting only queue/todo updates with no measurable work."
    });
    expect(runtimeLogPayloads).toContainEqual(
      expect.objectContaining({
        reason: "Pi ended the turn after emitting only queue/todo updates with no measurable work.",
        diagnostics: expect.objectContaining({
          turnSequence: 1,
          command: expect.objectContaining({
            type: "prompt"
          }),
          processDiagnostics: expect.objectContaining({
            processId: expect.any(String)
          }),
          failureEvent: expect.objectContaining({
            type: "agent_end"
          }),
          eventTrace: expect.arrayContaining([
            expect.objectContaining({
              type: "queue_update"
            })
          ])
        })
      })
    );

    database.close();
  });

  it("fails persisted native Pi RPC runs that never emit an explicit delivery report", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-delivery-report-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "Blocked");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "implementation",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker,
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "failure",
      reason: expect.stringContaining("symphony tool finish")
    });
    expect(await deliveryReports.listForRun(runId)).toEqual([]);

    database.close();
  });

  it("injects persisted rework handoff context into the first-turn prompt for rework runs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-rework-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "Blocked");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const agentReadStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "rework",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });
    const loadLatestReworkHandoff = await buildWorkflowBackedReworkHandoffLoader({
      db: database.db,
      issueIdentifier: issue.identifier,
      repositoryKey: testRepositoryKey,
      trackerConfig: runtimePolicy.tracker,
      handoffs: [buildSymphonyReworkHandoff()]
    });

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(
          root,
          "You are working on {{ issue.identifier }}.\n\n{{ handoff_section }}"
        ),
        tracker,
        runStore,
        deliveryReports,
        loadLatestReworkHandoff,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete() {
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "rework",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    const runDetail = await agentReadStore.fetchRunDetail(runId);
    expect(runDetail?.turns[0]?.promptText).toContain("Rework handoff:");
    expect(runDetail?.turns[0]?.promptText).toContain(
      "GitHub review feedback triggered rework"
    );
    expect(runDetail?.turns[0]?.promptText).toContain(
      "https://github.com/openai/symphony/pull/123#pullrequestreview-456"
    );
    expect(runDetail?.turns[0]?.promptText).toContain(
      "Please rename this API and add the missing test coverage."
    );

    database.close();
  });

  it("leaves the first-turn prompt unchanged when no rework handoff exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-no-rework-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "In Progress");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const agentReadStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "implementation",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(
          root,
          "You are working on {{ issue.identifier }}.\n\n{{ handoff_section }}"
        ),
        tracker,
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete() {
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    const runDetail = await agentReadStore.fetchRunDetail(runId);
    expect(runDetail?.turns[0]?.promptText).toContain(
      `You are working on ${issue.identifier}.`
    );
    expect(runDetail?.turns[0]?.promptText).not.toContain("Rework handoff:");
    expect(runDetail?.turns[0]?.promptText).not.toContain(
      "GitHub review feedback triggered rework"
    );

    database.close();
  });

  it("does not inject rework handoff context for implementation runs", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "symphony-agent-runtime-implementation-handoff-")
    );
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "In Progress");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const agentReadStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "implementation",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });
    const loadLatestReworkHandoff = await buildWorkflowBackedReworkHandoffLoader({
      db: database.db,
      issueIdentifier: issue.identifier,
      repositoryKey: testRepositoryKey,
      trackerConfig: runtimePolicy.tracker,
      handoffs: [buildSymphonyReworkHandoff()]
    });

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(
          root,
          "You are working on {{ issue.identifier }}.\n\n{{ handoff_section }}"
        ),
        tracker,
        runStore,
        deliveryReports,
        loadLatestReworkHandoff,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete() {
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    const runDetail = await agentReadStore.fetchRunDetail(runId);
    expect(runDetail?.turns[0]?.promptText).not.toContain("Rework handoff:");
    expect(runDetail?.turns[0]?.promptText).not.toContain(
      "GitHub review feedback triggered rework"
    );

    database.close();
  });

  it("uses the explicit run mode when it differs from the visible issue state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-run-mode-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "In Progress");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const agentReadStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "approved_merge",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });
    const loadLatestMergeResult = await buildWorkflowBackedMergeResultLoader({
      db: database.db,
      issueIdentifier: issue.identifier,
      repositoryKey: testRepositoryKey,
      trackerConfig: runtimePolicy.tracker,
      runId,
      mergeResults: [
        {
          recordedAt: "2026-04-10T16:35:00.000Z",
          mergeResult: buildRuntimeMergeResult()
        }
      ]
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "{{ run_mode_section }}"),
        tracker,
        runStore,
        deliveryReports,
        loadLatestMergeResult,
        loadCurrentWorkflowTrackerState: async () => "Done",
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {},
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "approved_merge",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "merged"
    });

    const runDetail = await agentReadStore.fetchRunDetail(runId);
    expect(runDetail?.turns[0]?.promptText).toContain(
      "Current run mode: Approved Merge"
    );
    expect(runDetail?.turns[0]?.promptText).toContain(
      "This run is for merge completion, not normal feature development."
    );

    database.close();
  });

  it("fails approved merge runs that end without an explicit merge result", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-run-mode-missing-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createDoneTracker(issue);
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "approved_merge",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "{{ run_mode_section }}"),
        tracker,
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "approved_merge",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "failure",
      reason: expect.stringContaining("symphony tool merge-result")
    });

    database.close();
  });

  it("emits merge_blocked when the approved run records a blocked merge result", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-run-mode-blocked-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createStateTracker(issue, "In Progress");
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "approved_merge",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });
    const loadLatestMergeResult = await buildWorkflowBackedMergeResultLoader({
      db: database.db,
      issueIdentifier: issue.identifier,
      repositoryKey: testRepositoryKey,
      trackerConfig: runtimePolicy.tracker,
      runId,
      mergeResults: [
        {
          recordedAt: "2026-04-10T16:36:00.000Z",
          mergeResult: buildRuntimeMergeResult({
            status: "blocked",
            summary: "Main branch introduced conflicts in the workspace package.",
            mergeCommitSha: null,
            blockingReason: "Conflicts in packages/workspace/src/docker-client.ts",
            testsSummary: "pnpm test --filter @symphony/workspace"
          })
        }
      ]
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "{{ run_mode_section }}"),
        tracker,
        runStore,
        deliveryReports,
        loadLatestMergeResult,
        loadCurrentWorkflowTrackerState: async () => "Blocked",
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {},
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "approved_merge",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "merge_blocked",
      reason: "Conflicts in packages/workspace/src/docker-client.ts"
    });

    database.close();
  });

  it("fails approved merge runs when the merge result does not reach the expected terminal state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-run-mode-merge-mismatch-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createDoneTracker(issue);
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "approved_merge",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });
    const loadLatestMergeResult = await buildWorkflowBackedMergeResultLoader({
      db: database.db,
      issueIdentifier: issue.identifier,
      repositoryKey: testRepositoryKey,
      trackerConfig: runtimePolicy.tracker,
      runId,
      mergeResults: [
        {
          recordedAt: "2026-04-10T16:37:00.000Z",
          mergeResult: buildRuntimeMergeResult()
        }
      ]
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "{{ run_mode_section }}"),
        tracker,
        runStore,
        deliveryReports,
        loadLatestMergeResult,
        loadCurrentWorkflowTrackerState: async () => "In Progress",
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {},
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "approved_merge",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "failure",
      reason: expect.stringContaining("did not reach `Done`")
    });

    database.close();
  });

  it("uses the latest persisted rework handoff in the first-turn prompt", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-latest-rework-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createDoneTracker(issue);
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const agentReadStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "rework",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });
    const loadLatestReworkHandoff = await buildWorkflowBackedReworkHandoffLoader({
      db: database.db,
      issueIdentifier: issue.identifier,
      repositoryKey: testRepositoryKey,
      trackerConfig: runtimePolicy.tracker,
      handoffs: [
        buildSymphonyReworkHandoff({
          reviewContextUrl:
            "https://github.com/openai/symphony/pull/123#pullrequestreview-111",
          feedbackBody: "Old feedback that should not be used.",
          recordedAt: "2026-04-05T00:00:00.000Z"
        }),
        buildSymphonyReworkHandoff({
          triggerKind: "changes_requested_review",
          reviewContextUrl:
            "https://github.com/openai/symphony/pull/123#pullrequestreview-222",
          feedbackBody: "Newest feedback that should be shown first."
        })
      ]
    });

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(
          root,
          "You are working on {{ issue.identifier }}.\n\n{{ handoff_section }}"
        ),
        tracker,
        runStore,
        deliveryReports,
        loadLatestReworkHandoff,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete() {
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "rework",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    const runDetail = await agentReadStore.fetchRunDetail(runId);
    expect(runDetail?.turns[0]?.promptText).toContain("Rework handoff:");
    expect(runDetail?.turns[0]?.promptText).toContain(
      "https://github.com/openai/symphony/pull/123#pullrequestreview-222"
    );
    expect(runDetail?.turns[0]?.promptText).toContain(
      "Newest feedback that should be shown first."
    );
    expect(runDetail?.turns[0]?.promptText).not.toContain(
      "Old feedback that should not be used."
    );

    database.close();
  });

  it.skip("fails completed app-server runs that never emit an explicit delivery report", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-delivery-required-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiAppServerBinary(
      fakePi,
      `#!/bin/sh
count=0
while IFS= read -r _line; do
  count=$((count + 1))
  case "$count" in
    1)
      printf '%s\\n' '{"id":1,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-missing-delivery"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-missing-delivery"}}}'
      printf '%s\\n' '{"method":"turn/completed"}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    );
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root, {
      agentRuntime: {
        ...buildSymphonyRuntimePolicyForRoot(root).agentRuntime,
        command: `${fakePi} app-server`
      }
    });
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker: createDoneTracker(issue),
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId: null,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "failure",
      reason: expect.stringContaining("symphony tool finish")
    });

    database.close();
  });

  it("reports max-turn pauses as a first-class completion", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-runtime-max-turns-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(
      fakeDocker,
      path.join(root, "fake-docker-log.json")
    );
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    let refreshCount = 0;
    const tracker: SymphonyTracker = {
      async fetchCandidateIssues() {
        return [issue];
      },
      async fetchIssuesByStates() {
        return [issue];
      },
      async fetchIssueStatesByIds() {
        refreshCount += 1;
        return [
          {
            ...issue,
            state: refreshCount >= 1 ? "In Progress" : issue.state
          }
        ];
      },
      async fetchIssueByIdentifier() {
        return issue;
      },
      async createComment() {
        return;
      },
      async updateIssueState() {
        return;
      }
    };
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root, {
      agent: {
        ...buildSymphonyRuntimePolicyForRoot(root).agent,
        maxTurns: 1
      },
    });
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "implementation",
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker,
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "max_turns_reached",
      maxTurns: 1,
      reason:
        "Reached the configured 1-turn limit while the issue remained active."
    });

    database.close();
  });

  it("classifies rate-limit failures distinctly", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-runtime-rate-limit-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(
      fakePi,
      `#!/bin/sh
process_id="pi-session-1"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  id="$(printf '%s\\n' "$line" | sed -E 's/.*"id":"([^"]+)".*/\\1/')"
  command="$(printf '%s\\n' "$line" | sed -E 's/.*"type":"([^"]+)".*/\\1/')"

    if [ "$command" = "get_state" ]; then
    printf '%s\\n' '{"id":"'"$id"'","type":"response","success":true,"data":{"sessionId":"'"$process_id"'","model":{"id":"x","provider":"openrouter"}}}'
    continue
  fi

  if [ "$command" = "prompt" ]; then
    printf '%s\\n' '{"id":"'"$id"'","type":"response","success":true}'
    printf '%s\\n' '{"type":"process_exit","reason":"rate_limit_exceeded"}'
    exit 0
  fi
done
`
    );
    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(
      fakeDocker,
      path.join(root, "fake-docker-log.json")
    );
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createDoneTracker(issue);
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker,
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId: null,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "rate_limited",
      reason: "rate_limit_exceeded"
    });

    database.close();
  });

  it("classifies transient provider gateway failures distinctly", () => {
    expect(
      isTransientProviderError(
        new Error(
          "unexpected status 502 Bad Gateway: error code: 502, url: https://openrouter.ai/api/v1/responses, cf-ray: test"
        ),
        "openrouter"
      )
    ).toBe(true);
    expect(
      isTransientProviderError(
        new Error("Missing environment variable: OPENROUTER_API_KEY."),
        "openrouter"
      )
    ).toBe(false);
    expect(
      isTransientProviderError(
        new Error("unexpected status 502 Bad Gateway"),
        null
      )
    ).toBe(false);
  });

  it("launches container-backed workspaces through docker exec while snapshotting the host repo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-runtime-container-"));
    tempRoots.push(root);

    const hostWorkspacePath = path.join(root, "workspace");
    await mkdir(hostWorkspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(hostWorkspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);

    const fakeDocker = path.join(root, "docker");
    const fakeDockerLog = path.join(root, "fake-docker-log.json");
    const fakeDockerEnvLog = path.join(root, "fake-docker-env.log");
    await writeFakeDockerBinary(
      fakeDocker,
      fakeDockerLog,
      undefined,
      fakeDockerEnvLog
    );
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createDoneTracker(issue);
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const agentReadStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "implementation",
      status: "dispatching",
      workspacePath: hostWorkspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    const runtimeLogPayloads: unknown[] = [];
    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        apiPort: 4_400,
        tracker,
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record(input) {
            runtimeLogPayloads.push(input.payload);
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildContainerPreparedWorkspace(issue.identifier, hostWorkspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "failure",
      reason: expect.stringContaining("symphony tool finish")
    });

    const fakeDockerInvocation = JSON.parse(
      await readFile(fakeDockerLog, "utf8")
    ) as {
      command: string;
      containerName: string;
      workdir: string;
    };
    expect(fakeDockerInvocation).toEqual({
      command: "exec",
      containerName: "symphony-col-123-container",
      workdir: "/workspace"
    });
    expect(await readFile(fakeDockerEnvLog, "utf8")).toContain(
      "SYMPHONY_API_BASE_URL=http://host.docker.internal:4400/api/v1/internal/runtime-tools"
    );
    expect(runtimeLogPayloads).toContainEqual(
      expect.objectContaining({
        launchTarget: expect.objectContaining({
          kind: "container",
          hostLaunchPath: hostWorkspacePath,
          containerName: "symphony-col-123-container",
          hostWorkspacePath: hostWorkspacePath,
          runtimeWorkspacePath: "/workspace"
        })
      })
    );

    const runDetail = await agentReadStore.fetchRunDetail(runId);
    expect(runDetail?.run.commitHashStart).toMatch(/[0-9a-f]{40}/);
    expect(runDetail?.run.commitHashEnd).toMatch(/[0-9a-f]{40}/);
    expect(runDetail?.run.repoStart).toMatchObject({
      available: true,
      source: "bind_mount",
      dirty: false
    });
    expect(runDetail?.run.repoEnd).toMatchObject({
      available: true,
      source: "bind_mount",
      dirty: false
    });

    database.close();
  });

  it("reports container launch startup failures with launch-target metadata", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "symphony-agent-runtime-runtime-container-startup-failure-")
    );
    tempRoots.push(root);

    const hostWorkspacePath = path.join(root, "workspace");
    await mkdir(hostWorkspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(hostWorkspacePath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(
      fakePi,
      `#!/bin/sh
echo "pi startup failed" >&2
exit 1
`
    );

    const fakeDocker = path.join(root, "docker");
    await writeFakeDockerBinary(fakeDocker, path.join(root, "fake-docker-log.json"));
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root, {
      pi: {
        ...buildSymphonyRuntimePolicyForRoot(root).pi,
        readTimeoutMs: 25
      }
    });
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });

    const runtimeLogPayloads: unknown[] = [];
    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker: createDoneTracker(issue),
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record(input) {
            runtimeLogPayloads.push(input.payload);
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId: null,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildContainerPreparedWorkspace(issue.identifier, hostWorkspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "startup_failure",
      reason: expect.stringContaining("Pi RPC process exited"),
      failureStage: "runtime_session_start",
      failureOrigin: "pi_startup",
      launchTarget: {
        kind: "container",
        hostLaunchPath: hostWorkspacePath,
        hostWorkspacePath,
        runtimeWorkspacePath: "/workspace",
        containerId: "container-123",
        containerName: "symphony-col-123-container",
        shell: "sh",
        user: "1000:1000"
      }
    });
    expect(runtimeLogPayloads).toContainEqual(
      expect.objectContaining({
        reason: expect.stringContaining("Pi RPC process exited"),
        launchTarget: expect.objectContaining({
          kind: "container",
          hostLaunchPath: hostWorkspacePath,
          containerName: "symphony-col-123-container",
          hostWorkspacePath,
          runtimeWorkspacePath: "/workspace"
        })
      })
    );

    database.close();
  }, 15_000);

  it("launches container-owned workspaces without a host repo path and snapshots repo state through docker exec", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "symphony-agent-runtime-runtime-container-owned-")
    );
    tempRoots.push(root);

    const containerRepoPath = path.join(root, "container-repo");
    await mkdir(containerRepoPath, {
      recursive: true
    });
    await initializeGitWorkspace(containerRepoPath);

    const fakePi = path.join(root, "pi");
    await writeFakePiBinary(fakePi);

    const fakeDocker = path.join(root, "docker");
    const fakeDockerLog = path.join(root, "fake-docker-log.jsonl");
    await writeFakeDockerBinary(fakeDocker, fakeDockerLog, containerRepoPath);
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createDoneTracker(issue);
    const runtimePolicy = buildSymphonyRuntimePolicyForRoot(root);
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const agentAnalytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const agentReadStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });
    await seedCanonicalIssue(database.db, issue);
    const runId = await runStore.recordRunStarted({
      repositoryKey: testRepositoryKey,
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier,
      runId: [issue.identifier, "run"].join("-"),
      runMode: "implementation",
      status: "dispatching",
      workspacePath: null,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createSymphonyAgentRuntime({
        promptContract: buildPromptContract(root, "You are working on {{ issue.identifier }}."),
        tracker,
        runStore,
        deliveryReports,
        agentAnalytics,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.pi-runtime"),
        callbacks: {
          async onUpdate() {
            return;
          },
          async onComplete(_issueId, result) {
            completion = result;
            resolve();
          }
        }
      });

      void runtime.startRun({
        issue,
        runId,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace: buildContainerPreparedWorkspace(issue.identifier, null)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "failure",
      reason: expect.stringContaining("symphony tool finish")
    });

    const dockerInvocations = (await readFile(fakeDockerLog, "utf8"))
      .trim()
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as {
        command: string;
        containerName: string;
        workdir: string;
      });
    expect(dockerInvocations.some((entry) => entry.command === "exec")).toBe(true);
    expect(dockerInvocations.some((entry) => entry.workdir === "/workspace")).toBe(
      true
    );

    const runDetail = await agentReadStore.fetchRunDetail(runId);
    expect(runDetail?.run.workspacePath).toBeNull();
    expect(runDetail?.run.commitHashStart).toBeNull();
    expect(runDetail?.run.commitHashEnd).toMatch(/[0-9a-f]{40}/);
    expect(runDetail?.run.repoStart).toMatchObject({
      available: false,
      source: "container_exec",
      host_workspace_path: null,
      container_name: "symphony-col-123-container",
      error: expect.stringContaining("spawn docker ENOENT")
    });
    expect(runDetail?.run.repoEnd).toMatchObject({
      available: true,
      source: "container_exec",
      host_workspace_path: null,
      container_name: "symphony-col-123-container",
      dirty: false
    });

    database.close();
  });

});

function createDoneTracker(issue: SymphonyTrackerIssue): SymphonyTracker {
  return createStateTracker(issue, "Done");
}

function createStateTracker(
  issue: SymphonyTrackerIssue,
  state: string
): SymphonyTracker {
  return {
    async fetchCandidateIssues() {
      return [issue];
    },
    async fetchIssuesByStates() {
      return [issue];
    },
    async fetchIssueStatesByIds() {
      return [
        {
          ...issue,
          state
        }
      ];
    },
    async fetchIssueByIdentifier() {
      return issue;
    },
    async createComment() {
      return;
    },
    async updateIssueState() {
      return;
    }
  };
}

async function writeFakePiBinary(piBinary: string, script?: string): Promise<void> {
  await writeFile(
    piBinary,
    script ??
      `#!/bin/sh
session_id="pi-session-1"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  id="$(printf '%s\\n' "$line" | sed -E 's/.*"id":"([^"]+)".*/\\1/')"
  command="$(printf '%s\\n' "$line" | sed -E 's/.*"type":"([^"]+)".*/\\1/')"

  if [ "$command" = "get_state" ]; then
    printf '%s\\n' '{"id":"'"$id"'","type":"response","success":true,"data":{"sessionId":"'"$session_id"'","model":{"id":"x","provider":"openrouter"}}}'
    continue
  fi

  if [ "$command" = "prompt" ]; then
    printf '%s\\n' '{"id":"'"$id"'","type":"response","success":true}'
    printf '%s\\n' '{"type":"message_end","message":{"responseId":"msg-1","role":"assistant","content":[{"type":"text","text":"ok"}],"usage":{"input":5,"cacheRead":0,"output":2}}}'
    printf '%s\\n' '{"type":"agent_end"}'
    continue
  fi
done
`
    );
  await chmod(piBinary, 0o755);
}

async function writeFakePiAppServerBinary(
  piBinary: string,
  script?: string
): Promise<void> {
  await writeFile(
    piBinary,
    script ??
      `#!/bin/sh
count=0
while IFS= read -r _line; do
  count=$((count + 1))
  case "$count" in
    1)
      printf '%s\\n' '{"id":1,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-1"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-1"}}}'
      printf '%s\\n' '{"method":"turn/completed"}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
  );
  await chmod(piBinary, 0o755);
}

async function writeFakeDockerBinary(
  dockerBinary: string,
  logPath: string,
  repoPath?: string,
  envLogPath?: string
): Promise<void> {
  await writeFile(
    dockerBinary,
    `#!/bin/sh
set -eu
repo_path=""
${repoPath ? `repo_path='${repoPath.replaceAll("'", `'"'"'`) }'` : ""}
env_log_path=""
${envLogPath ? `env_log_path='${envLogPath.replaceAll("'", `'"'"'`) }'` : ""}
if [ "$1" != "exec" ]; then
  echo "unexpected docker command: $1" >&2
  exit 99
fi
shift
workdir=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -i)
      shift
      ;;
    --user)
      shift 2
      ;;
    --env)
      if [ -n "$env_log_path" ]; then
        printf '%s\n' "$2" >> "$env_log_path"
      fi
      shift 2
      ;;
    --workdir)
      workdir="$2"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done
container_name="$1"
shift
launcher="$1"
shift
if [ "$launcher" = "sh" ] || [ "$launcher" = "/bin/sh" ]; then
  if [ "$1" != "-lc" ]; then
  echo "unexpected docker shell args" >&2
  exit 98
  fi
  shift
  shell_command="$1"
  if [ -n "$repo_path" ] && printf '%s\n' "$shell_command" | grep -q '^git '; then
    (cd "$repo_path" && sh -c "$shell_command")
    exit $?
  fi
  set -- "-lc" "$shell_command"
fi
printf '{"command":"exec","containerName":"%s","workdir":"%s"}\\n' "$container_name" "$workdir" >> "${logPath}"
${repoPath ? `cd "$repo_path"` : ""}
exec "$launcher" "$@"
`
  );
  await chmod(dockerBinary, 0o755);
}

async function initializeGitWorkspace(workspacePath: string): Promise<void> {
  await execFileAsync("git", ["init"], {
    cwd: workspacePath
  });
  await execFileAsync("git", ["config", "user.name", "Symphony Test"], {
    cwd: workspacePath
  });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], {
    cwd: workspacePath
  });
  await writeFile(path.join(workspacePath, "tracked.txt"), "hello world\n");
  await execFileAsync("git", ["add", "tracked.txt"], {
    cwd: workspacePath
  });
  await execFileAsync("git", ["commit", "-m", "init"], {
    cwd: workspacePath
  });
}

function buildBindMountPreparedWorkspace(
  issueIdentifier: string,
  workspacePath: string
) {
  return {
    issueIdentifier,
    workspaceKey: issueIdentifier,
    backendKind: "docker" as const,
    prepareDisposition: "reused" as const,
    containerDisposition: "reused" as const,
    networkDisposition: "reused" as const,
    afterCreateHookOutcome: "skipped" as const,
    executionTarget: {
      kind: "container" as const,
      workspacePath: "/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123-container",
      hostPath: workspacePath,
      shell: "sh",
      user: "1000:1000"
    },
    materialization: {
      kind: "bind_mount" as const,
      hostPath: workspacePath,
      containerPath: "/workspace"
    },
    networkName: "symphony-network-col-123",
    services: [],
    envBundle: ambientEnvBundle(),
    manifestLifecycle: null,
    path: null,
    created: false,
    workerHost: null
  };
}

function buildContainerPreparedWorkspace(
  issueIdentifier: string,
  hostWorkspacePath: string | null
) {
  return {
    issueIdentifier,
    workspaceKey: issueIdentifier,
    backendKind: "docker" as const,
    prepareDisposition: "reused" as const,
    containerDisposition: "reused" as const,
    networkDisposition: "reused" as const,
    afterCreateHookOutcome: "skipped" as const,
    executionTarget: {
      kind: "container" as const,
      workspacePath: "/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123-container",
      hostPath: hostWorkspacePath,
      shell: "sh",
      user: "1000:1000"
    },
    materialization:
      hostWorkspacePath === null
        ? {
            kind: "volume" as const,
            volumeName: "symphony-col-123-volume",
            containerPath: "/workspace",
            hostPath: null
          }
        : {
            kind: "bind_mount" as const,
            hostPath: hostWorkspacePath,
            containerPath: "/workspace"
          },
    networkName: "symphony-network-col-123",
    services: [],
    envBundle: ambientEnvBundle(),
    manifestLifecycle: null,
    path: null,
    created: false,
    workerHost: "docker-host"
  };
}

function ambientEnvBundle() {
  return {
    source: "ambient" as const,
    values: {},
    summary: {
      source: "ambient" as const,
      injectedKeys: [],
      requiredHostKeys: [],
      optionalHostKeys: [],
      repoEnvPath: null,
      projectedRepoKeys: [],
      requiredRepoKeys: [],
      optionalRepoKeys: [],
      staticBindingKeys: [],
      runtimeBindingKeys: [],
      serviceBindingKeys: []
    }
  };
}

async function buildWorkflowBackedReworkHandoffLoader(input: {
  db: ReturnType<typeof initializeSymphonyDb>["db"];
  issueIdentifier: string;
  repositoryKey: string;
  trackerConfig: SymphonyTrackerConfig;
  handoffs: SymphonyReworkHandoff[];
}): Promise<(issueIdentifier: string) => Promise<SymphonyReworkHandoff | null>> {
  const workflowLifecycle = await createWorkflowBackedLifecycleHarness({
    db: input.db,
    issueIdentifier: input.issueIdentifier,
    repositoryKey: input.repositoryKey,
    trackerConfig: input.trackerConfig,
    nowIso: "2026-04-10T16:00:00.000Z"
  });

  await workflowLifecycle.recordTrackerObserved({
    trackerState: "In Review",
    recordedAt: "2026-04-10T16:00:00.000Z"
  });

  for (const handoff of input.handoffs) {
    await workflowLifecycle.recordReviewReworkRequested({
      handoff
    });
  }

  return async (issueIdentifier) => {
    return await workflowLifecycle.loadLatestReworkHandoff(issueIdentifier);
  };
}

async function buildWorkflowBackedMergeResultLoader(input: {
  db: ReturnType<typeof initializeSymphonyDb>["db"];
  issueIdentifier: string;
  repositoryKey: string;
  trackerConfig: SymphonyTrackerConfig;
  runId: string;
  mergeResults: Array<{
    recordedAt: string;
    mergeResult: RuntimeMergeResult;
  }>;
}): Promise<
  (issueIdentifier: string, runId: string) => Promise<RuntimeMergeResult | null>
> {
  const workflowLifecycle = await createWorkflowBackedLifecycleHarness({
    db: input.db,
    issueIdentifier: input.issueIdentifier,
    repositoryKey: input.repositoryKey,
    trackerConfig: input.trackerConfig,
    nowIso: "2026-04-10T16:30:00.000Z"
  });

  await workflowLifecycle.recordTrackerObserved({
    trackerState: "Approved",
    recordedAt: "2026-04-10T16:30:00.000Z"
  });
  await workflowLifecycle.recordRunStarted({
    runId: input.runId,
    runMode: "approved_merge",
    recordedAt: "2026-04-10T16:30:01.000Z"
  });

  for (const entry of input.mergeResults) {
    await workflowLifecycle.recordMergeResult({
      runId: input.runId,
      recordedAt: entry.recordedAt,
      mergeResult: entry.mergeResult
    });
  }

  return async (issueIdentifier, runId) => {
    return await workflowLifecycle.loadLatestMergeResult(issueIdentifier, runId);
  };
}

async function createWorkflowBackedLifecycleHarness(input: {
  db: ReturnType<typeof initializeSymphonyDb>["db"];
  issueIdentifier: string;
  repositoryKey: string;
  trackerConfig: SymphonyTrackerConfig;
  nowIso: string;
}) {
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore: createRouteWorkflowStore(input.db)
  });
  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: input.trackerConfig,
    now: () => new Date(input.nowIso)
  });
  const sessionLoader = await createRuntimeWorkflowSessionLoader({
    routeWorkflows,
    trackerConfig: input.trackerConfig,
    now: () => new Date(input.nowIso)
  });

  await routeWorkflows.ensureWorkflowForIssue({
    issueIdentifier: input.issueIdentifier,
    repositoryKey: input.repositoryKey,
    routerPresetId: routing.presetId,
    router: routing.router,
    createdAt: input.nowIso
  });

  async function recordSignal(signal: WorkflowSignal, context: string) {
    const loaded = await sessionLoader.resumeByIssueIdentifier({
      issueIdentifier: input.issueIdentifier
    });
    if (!loaded) {
      throw new TypeError(
        `Route workflow could not be resumed for ${input.issueIdentifier} while ${context}.`
      );
    }

    await routeWorkflows.recordRouteResult({
      workflowId: loaded.resumed.hydrationState.workflow.workflowId,
      policy: loaded.routing.policy,
      result: await loaded.resumed.session.receiveAsync(signal)
    });
  }

  return {
    async loadLatestReworkHandoff(issueIdentifier: string) {
      const projection = await loadWorkflowProjectionByIssueIdentifier({
        sessionLoader,
        issueIdentifier
      });
      if (!projection) {
        return null;
      }

      return projection.loaded.routing.module.runtimeAdapter.readLatestReworkHandoffFromProjection(
        {
          workflowId: projection.workflowId,
          data: projection.data
        }
      );
    },
    async loadLatestMergeResult(issueIdentifier: string, runId: string) {
      const projection = await loadWorkflowProjectionByIssueIdentifier({
        sessionLoader,
        issueIdentifier
      });
      if (!projection) {
        return null;
      }

      return projection.loaded.routing.module.runtimeAdapter.readLatestMergeResultFromProjection(
        {
          workflowId: projection.workflowId,
          data: projection.data,
          runId
        }
      );
    },
    async recordTrackerObserved(entry: {
      trackerState: string;
      recordedAt: string;
    }) {
      await recordSignal(
        routing.module.runtimeAdapter.createTrackerStateObservedSignal({
          id: `signal_tracker_state_observed_${entry.recordedAt}`,
          occurredAt: entry.recordedAt,
          trackerState: entry.trackerState,
          runId: null,
          runMode: null,
          causationId: null,
          correlationId: input.issueIdentifier
        }),
        `recording tracker observation ${entry.recordedAt}`
      );
    },
    async recordReviewReworkRequested(entry: {
      handoff: SymphonyReworkHandoff;
    }) {
      await recordSignal(
        routing.module.runtimeAdapter.createReviewReworkRequestedSignal({
          id: `signal_review_rework_requested_${entry.handoff.recordedAt}`,
          occurredAt: entry.handoff.recordedAt,
          handoff: entry.handoff,
          causationId: input.issueIdentifier,
          correlationId: input.issueIdentifier
        }),
        `recording rework handoff ${entry.handoff.recordedAt}`
      );
    },
    async recordRunStarted(entry: {
      runId: string;
      runMode: "implementation" | "rework" | "approved_merge";
      recordedAt: string;
    }) {
      await recordSignal(
        routing.module.runtimeAdapter.createRunStartedSignal({
          id: `signal_run_started_${entry.recordedAt}`,
          occurredAt: entry.recordedAt,
          runId: entry.runId,
          runMode: entry.runMode,
          causationId: entry.runId,
          correlationId: input.issueIdentifier
        }),
        `recording run start ${entry.recordedAt}`
      );
    },
    async recordMergeResult(entry: {
      runId: string;
      recordedAt: string;
      mergeResult: RuntimeMergeResult;
    }) {
      await recordSignal(
        routing.module.runtimeAdapter.createMergeResultReportedSignal({
          id: `signal_merge_result_reported_${entry.recordedAt}`,
          occurredAt: entry.recordedAt,
          runId: entry.runId,
          mergeResult: entry.mergeResult,
          causationId: entry.runId,
          correlationId: input.issueIdentifier
        }),
        `recording merge result ${entry.recordedAt}`
      );
    }
  };
}

async function loadWorkflowProjectionByIssueIdentifier(input: {
  sessionLoader: Awaited<
    ReturnType<typeof createRuntimeWorkflowSessionLoader>
  >;
  issueIdentifier: string;
}) {
  const loaded = await input.sessionLoader.loadHydrationByIssueIdentifier({
    issueIdentifier: input.issueIdentifier
  });
  if (!loaded?.hydrationState.snapshot) {
    return null;
  }

  return {
    loaded,
    workflowId: loaded.hydrationState.workflow.workflowId,
    data: loaded.hydrationState.snapshot.projection.data
  };
}

function buildPromptContract(root: string, template: string) {
  return {
    repoRoot: path.join(root, "source-repo"),
    promptPath: path.join(root, "source-repo", ".symphony", "prompt.md"),
    template,
    variables: [...template.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)].map((match) =>
      match[1]!.trim()
    )
  };
}
