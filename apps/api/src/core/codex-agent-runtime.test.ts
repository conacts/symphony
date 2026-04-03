import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSqliteSymphonyRunJournal,
  initializeSymphonyDb
} from "@symphony/db";
import { createSilentSymphonyLogger } from "@symphony/logger";
import type { SymphonyAgentRuntimeCompletion } from "@symphony/core/orchestration";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/core/tracker";
import { createCodexSymphonyAgentRuntime } from "./codex-agent-runtime.js";
import { buildSymphonyRuntimeTrackerIssue, buildSymphonyRuntimeWorkflowConfig } from "../test-support/create-symphony-runtime-test-harness.js";

const tempRoots: string[] = [];
const execFileAsync = promisify(execFile);
const originalPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = originalPath;
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

describe("docker codex symphony agent runtime", () => {
  it("runs a real app-server turn and records turn events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-runtime-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);
    await writeFile(path.join(workspacePath, "tracked.txt"), "hello world\nchanged\n");

    const fakeCodex = path.join(root, "fake-codex.sh");
    await writeFakeCodexBinary(fakeCodex);
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
    const workflowConfig = buildSymphonyRuntimeWorkflowConfig(root, {
      codex: {
        ...buildSymphonyRuntimeWorkflowConfig(root).codex,
        command: `${fakeCodex} app-server`
      }
    });
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db")
    });
    const runId = await runJournal.recordRunStarted({
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    const updates: string[] = [];
    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createCodexSymphonyAgentRuntime({
        promptTemplate: "You are working on {{ issue.identifier }}.",
        tracker,
        runJournal,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        workflowConfig,
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.codex-runtime"),
        callbacks: {
          async onUpdate(_issueId, update) {
            updates.push(update.event);
          },
          async onComplete(_issueId, result) {
            completion = result;
            await runJournal.finalizeRun(runId, {
              status: "finished",
              outcome: result.kind === "normal" ? "completed_turn_batch" : "failed",
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
        workflowConfig,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "normal"
    });
    expect(updates).toContain("session_started");
    expect(updates).toContain("thread/tokenUsage/updated");
    expect(updates).toContain("turn_completed");

    const exportPayload = await runJournal.fetchRunExport(runId);
    expect(exportPayload?.turns).toHaveLength(1);
    expect(
      exportPayload?.turns[0]?.events.map((event: { eventType: string }) => event.eventType)
    ).toEqual(["session_started", "thread/tokenUsage/updated", "turn_completed"]);
    expect(exportPayload?.run.commitHashStart).toMatch(/[0-9a-f]{40}/);
    expect(exportPayload?.run.commitHashEnd).toMatch(/[0-9a-f]{40}/);
    expect(exportPayload?.run.repoStart).toMatchObject({
      available: true,
      dirty: true
    });
    expect(exportPayload?.run.repoEnd).toMatchObject({
      available: true,
      dirty: true
    });

    database.close();
  });

  it("reports max-turn pauses as a first-class completion", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-runtime-max-turns-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakeCodex = path.join(root, "fake-codex.sh");
    await writeFakeCodexBinary(fakeCodex);
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
    const workflowConfig = buildSymphonyRuntimeWorkflowConfig(root, {
      agent: {
        ...buildSymphonyRuntimeWorkflowConfig(root).agent,
        maxTurns: 1
      },
      codex: {
        ...buildSymphonyRuntimeWorkflowConfig(root).codex,
        command: `${fakeCodex} app-server`
      }
    });
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db")
    });
    const runId = await runJournal.recordRunStarted({
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      status: "dispatching",
      workspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createCodexSymphonyAgentRuntime({
        promptTemplate: "You are working on {{ issue.identifier }}.",
        tracker,
        runJournal,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        workflowConfig,
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.codex-runtime"),
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
        workflowConfig,
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
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-runtime-rate-limit-"));
    tempRoots.push(root);

    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(workspacePath);

    const fakeCodex = path.join(root, "fake-codex-rate-limit.sh");
    await writeFile(
      fakeCodex,
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
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-agent"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-agent"}}}'
      printf '%s\\n' '{"method":"turn/failed","params":{"message":"rate_limit_exceeded","code":"rate_limit_exceeded"}}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    );
    await chmod(fakeCodex, 0o755);
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
    const workflowConfig = buildSymphonyRuntimeWorkflowConfig(root, {
      codex: {
        ...buildSymphonyRuntimeWorkflowConfig(root).codex,
        command: `${fakeCodex} app-server`
      }
    });
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db")
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createCodexSymphonyAgentRuntime({
        promptTemplate: "You are working on {{ issue.identifier }}.",
        tracker,
        runJournal,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        workflowConfig,
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.codex-runtime"),
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
        workflowConfig,
        workspace: buildBindMountPreparedWorkspace(issue.identifier, workspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "rate_limited",
      reason: "Codex turn failed."
    });

    database.close();
  });

  it("launches container-backed workspaces through docker exec while snapshotting the host repo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-runtime-container-"));
    tempRoots.push(root);

    const hostWorkspacePath = path.join(root, "workspace");
    await mkdir(hostWorkspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(hostWorkspacePath);

    const fakeCodex = path.join(root, "fake-codex.sh");
    await writeFakeCodexBinary(fakeCodex);

    const fakeDocker = path.join(root, "docker");
    const fakeDockerLog = path.join(root, "fake-docker-log.json");
    await writeFakeDockerBinary(fakeDocker, fakeDockerLog);
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createDoneTracker(issue);
    const workflowConfig = buildSymphonyRuntimeWorkflowConfig(root, {
      codex: {
        ...buildSymphonyRuntimeWorkflowConfig(root).codex,
        command: `${fakeCodex} app-server`
      }
    });
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db")
    });
    const runId = await runJournal.recordRunStarted({
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      status: "dispatching",
      workspacePath: hostWorkspacePath,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    const runtimeLogPayloads: unknown[] = [];
    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createCodexSymphonyAgentRuntime({
        promptTemplate: "You are working on {{ issue.identifier }}.",
        tracker,
        runJournal,
        runtimeLogs: {
          async record(input) {
            runtimeLogPayloads.push(input.payload);
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        workflowConfig,
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.codex-runtime"),
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
        workflowConfig,
        workspace: buildContainerPreparedWorkspace(issue.identifier, hostWorkspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "normal"
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
      workdir: "/home/agent/workspace"
    });
    expect(runtimeLogPayloads).toContainEqual(
      expect.objectContaining({
        threadId: "thread-agent",
        launchTarget: expect.objectContaining({
          kind: "container",
          hostLaunchPath: hostWorkspacePath,
          containerName: "symphony-col-123-container",
          hostWorkspacePath: hostWorkspacePath,
          runtimeWorkspacePath: "/home/agent/workspace"
        })
      })
    );

    const exportPayload = await runJournal.fetchRunExport(runId);
    expect(exportPayload?.run.commitHashStart).toMatch(/[0-9a-f]{40}/);
    expect(exportPayload?.run.commitHashEnd).toMatch(/[0-9a-f]{40}/);
    expect(exportPayload?.run.repoStart).toMatchObject({
      available: true,
      source: "bind_mount",
      dirty: false
    });
    expect(exportPayload?.run.repoEnd).toMatchObject({
      available: true,
      source: "bind_mount",
      dirty: false
    });

    database.close();
  });

  it("reports container launch startup failures with launch-target metadata", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "symphony-codex-runtime-container-startup-failure-")
    );
    tempRoots.push(root);

    const hostWorkspacePath = path.join(root, "workspace");
    await mkdir(hostWorkspacePath, {
      recursive: true
    });
    await initializeGitWorkspace(hostWorkspacePath);

    const fakeCodex = path.join(root, "fake-codex.sh");
    await writeFakeCodexBinary(fakeCodex);

    const fakeDocker = path.join(root, "docker");
    await writeFile(
      fakeDocker,
      `#!/bin/sh
sleep 1
`
    );
    await chmod(fakeDocker, 0o755);
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const workflowConfig = buildSymphonyRuntimeWorkflowConfig(root, {
      codex: {
        ...buildSymphonyRuntimeWorkflowConfig(root).codex,
        command: `${fakeCodex} app-server`,
        readTimeoutMs: 25
      }
    });
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db")
    });

    const runtimeLogPayloads: unknown[] = [];
    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createCodexSymphonyAgentRuntime({
        promptTemplate: "You are working on {{ issue.identifier }}.",
        tracker: createDoneTracker(issue),
        runJournal,
        runtimeLogs: {
          async record(input) {
            runtimeLogPayloads.push(input.payload);
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        workflowConfig,
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.codex-runtime"),
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
        workflowConfig,
        workspace: buildContainerPreparedWorkspace(issue.identifier, hostWorkspacePath)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "startup_failure",
      reason: "Timed out waiting for Codex response 1.",
      failureStage: "runtime_session_start",
      failureOrigin: "codex_startup",
      launchTarget: {
        kind: "container",
        hostLaunchPath: hostWorkspacePath,
        hostWorkspacePath,
        runtimeWorkspacePath: "/home/agent/workspace",
        containerId: "container-123",
        containerName: "symphony-col-123-container",
        shell: "sh"
      }
    });
    expect(runtimeLogPayloads).toContainEqual(
      expect.objectContaining({
        reason: "Timed out waiting for Codex response 1.",
        launchTarget: expect.objectContaining({
          kind: "container",
          hostLaunchPath: hostWorkspacePath,
          containerName: "symphony-col-123-container",
          hostWorkspacePath,
          runtimeWorkspacePath: "/home/agent/workspace"
        })
      })
    );

    database.close();
  });

  it("launches container-owned workspaces without a host repo path and snapshots repo state through docker exec", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "symphony-codex-runtime-container-owned-")
    );
    tempRoots.push(root);

    const containerRepoPath = path.join(root, "container-repo");
    await mkdir(containerRepoPath, {
      recursive: true
    });
    await initializeGitWorkspace(containerRepoPath);

    const fakeCodex = path.join(root, "fake-codex.sh");
    await writeFakeCodexBinary(fakeCodex);

    const fakeDocker = path.join(root, "docker");
    const fakeDockerLog = path.join(root, "fake-docker-log.jsonl");
    await writeFakeDockerBinary(fakeDocker, fakeDockerLog, containerRepoPath);
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const tracker = createDoneTracker(issue);
    const workflowConfig = buildSymphonyRuntimeWorkflowConfig(root, {
      codex: {
        ...buildSymphonyRuntimeWorkflowConfig(root).codex,
        command: `${fakeCodex} app-server`
      }
    });
    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db")
    });
    const runId = await runJournal.recordRunStarted({
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      status: "dispatching",
      workspacePath: null,
      startedAt: "2026-03-31T00:00:00.000Z"
    });

    let completion: SymphonyAgentRuntimeCompletion | null = null;

    const completionPromise = new Promise<void>((resolve) => {
      const runtime = createCodexSymphonyAgentRuntime({
        promptTemplate: "You are working on {{ issue.identifier }}.",
        tracker,
        runJournal,
        runtimeLogs: {
          async record() {
            return "log-1";
          },
          async list() {
            return [];
          }
        },
        workflowConfig,
        hostCommandEnvSource: process.env,
        logger: createSilentSymphonyLogger("@symphony/api.test.codex-runtime"),
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
        workflowConfig,
        workspace: buildContainerPreparedWorkspace(issue.identifier, null)
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "normal"
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
    expect(dockerInvocations.some((entry) => entry.workdir === "/home/agent/workspace")).toBe(
      true
    );

    const exportPayload = await runJournal.fetchRunExport(runId);
    expect(exportPayload?.run.workspacePath).toBeNull();
    expect(exportPayload?.run.commitHashStart).toBeNull();
    expect(exportPayload?.run.commitHashEnd).toMatch(/[0-9a-f]{40}/);
    expect(exportPayload?.run.repoStart).toMatchObject({
      available: false,
      source: "container_exec",
      host_workspace_path: null,
      container_name: "symphony-col-123-container",
      error: expect.stringContaining("spawn docker ENOENT")
    });
    expect(exportPayload?.run.repoEnd).toMatchObject({
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
          state: "Done"
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

async function writeFakeCodexBinary(codexBinary: string): Promise<void> {
  await writeFile(
    codexBinary,
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
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-agent"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-agent"}}}'
      printf '%s\\n' '{"method":"thread/tokenUsage/updated","params":{"tokenUsage":{"total":{"inputTokens":5,"outputTokens":2,"totalTokens":7}}}}'
      printf '%s\\n' '{"method":"turn/completed","params":{"result":"ok"}}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
  );
  await chmod(codexBinary, 0o755);
}

async function writeFakeDockerBinary(
  dockerBinary: string,
  logPath: string,
  repoPath?: string
): Promise<void> {
  await writeFile(
    dockerBinary,
    `#!/bin/sh
set -eu
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
    --env)
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
shell_bin="$1"
shift
if [ "$1" != "-lc" ]; then
  echo "unexpected docker shell args" >&2
  exit 98
fi
shift
printf '{"command":"exec","containerName":"%s","workdir":"%s"}\\n' "$container_name" "$workdir" >> "${logPath}"
${repoPath ? `cd '${repoPath.replaceAll("'", `'"'"'`)}'` : ""}
exec "$shell_bin" -lc "$1"
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
      workspacePath: "/home/agent/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123-container",
      hostPath: workspacePath,
      shell: "sh"
    },
    materialization: {
      kind: "bind_mount" as const,
      hostPath: workspacePath,
      containerPath: "/home/agent/workspace"
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
      workspacePath: "/home/agent/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123-container",
      hostPath: hostWorkspacePath,
      shell: "sh"
    },
    materialization:
      hostWorkspacePath === null
        ? {
            kind: "volume" as const,
            volumeName: "symphony-col-123-volume",
            containerPath: "/home/agent/workspace",
            hostPath: null
          }
        : {
            kind: "bind_mount" as const,
            hostPath: hostWorkspacePath,
            containerPath: "/home/agent/workspace"
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
