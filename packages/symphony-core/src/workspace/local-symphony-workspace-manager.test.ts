import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLocalSymphonyWorkspaceManager,
  SymphonyWorkspaceError
} from "./local-symphony-workspace-manager.js";
import { buildSymphonyWorkflowConfig } from "../test-support/build-symphony-workflow-config.js";

const tempDirectories: string[] = [];

async function createWorkspaceRoot(): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "symphony-workspace-manager-")
  );
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

describe("local symphony workspace manager", () => {
  it("creates deterministic workspaces and only runs after_create on first creation", async () => {
    const hookCalls: string[] = [];
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      },
      hooks: {
        afterCreate: "echo bootstrapped",
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1_000
      }
    });

    const manager = createLocalSymphonyWorkspaceManager({
      commandRunner: async ({ command, cwd }) => {
        hookCalls.push(`${command}@${cwd}`);
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      }
    });

    const first = await manager.createForIssue(
      {
        issueId: "issue-1",
        issueIdentifier: "COL/200"
      },
      config.workspace,
      config.hooks
    );
    const second = await manager.createForIssue(
      {
        issueId: "issue-1",
        issueIdentifier: "COL/200"
      },
      config.workspace,
      config.hooks
    );

    expect(first.path).toBe(second.path);
    expect(path.basename(first.path)).toBe("symphony-COL_200");
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(hookCalls).toHaveLength(1);
  });

  it("replaces stale non-directory workspace paths", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      }
    });
    const manager = createLocalSymphonyWorkspaceManager();
    const workspacePath = manager.workspacePathForIssue("COL-300", root);

    await writeFile(workspacePath, "stale path");

    const workspace = await manager.createForIssue(
      {
        issueId: "issue-300",
        issueIdentifier: "COL-300"
      },
      config.workspace,
      config.hooks
    );

    expect(workspace.created).toBe(true);
  });

  it("fails closed on before_run hook errors and swallows after_run failures", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      },
      hooks: {
        afterCreate: null,
        beforeRun: "exit 1",
        afterRun: "exit 1",
        beforeRemove: null,
        timeoutMs: 1_000
      }
    });

    const manager = createLocalSymphonyWorkspaceManager({
      commandRunner: async ({ command }) => ({
        exitCode: command === "exit 1" ? 1 : 0,
        stdout: "",
        stderr: "hook failed"
      })
    });

    const workspace = await manager.createForIssue(
      {
        issueId: "issue-400",
        issueIdentifier: "COL-400"
      },
      config.workspace,
      {
        ...config.hooks,
        beforeRun: null
      }
    );

    await expect(
      manager.runBeforeRunHook(
        workspace.path,
        {
          issueId: "issue-400",
          issueIdentifier: "COL-400"
        },
        config.hooks
      )
    ).rejects.toThrowError(SymphonyWorkspaceError);

    await expect(
      manager.runAfterRunHook(
        workspace.path,
        {
          issueId: "issue-400",
          issueIdentifier: "COL-400"
        },
        config.hooks
      )
    ).resolves.toBeUndefined();
  });
});
