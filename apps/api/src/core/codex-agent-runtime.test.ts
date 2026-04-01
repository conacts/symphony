import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSqliteSymphonyRunJournal,
  initializeSymphonyDb
} from "@symphony/db";
import { createSilentSymphonyLogger } from "@symphony/logger";
import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/core";
import { createLocalCodexSymphonyAgentRuntime } from "./codex-agent-runtime.js";
import { buildSymphonyRuntimeTrackerIssue, buildSymphonyRuntimeWorkflowConfig } from "../test-support/create-symphony-runtime-test-harness.js";

const tempRoots: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("local codex symphony agent runtime", () => {
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
      const runtime = createLocalCodexSymphonyAgentRuntime({
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
        workspace: {
          issueIdentifier: issue.identifier,
          workspaceKey: issue.identifier,
          path: workspacePath,
          created: false,
          workerHost: null
        }
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
    expect(exportPayload?.turns[0]?.events.map((event) => event.eventType)).toEqual([
      "session_started",
      "thread/tokenUsage/updated",
      "turn_completed"
    ]);
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
      const runtime = createLocalCodexSymphonyAgentRuntime({
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
        workspace: {
          issueIdentifier: issue.identifier,
          workspaceKey: issue.identifier,
          path: workspacePath,
          created: false,
          workerHost: null
        }
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
      const runtime = createLocalCodexSymphonyAgentRuntime({
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
        workspace: {
          issueIdentifier: issue.identifier,
          workspaceKey: issue.identifier,
          path: workspacePath,
          created: false,
          workerHost: null
        }
      });
    });

    await completionPromise;

    expect(completion).toEqual({
      kind: "rate_limited",
      reason: "Codex turn failed."
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
