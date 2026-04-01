import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  SymphonyWorkspaceError,
  symphonyWorkspaceDirectoryName
} from "./local-symphony-workspace-manager.js";
import { createLocalWorkspaceBackend } from "./workspace-backend.js";
import { buildSymphonyWorkflowConfig } from "../test-support/build-symphony-workflow-config.js";

const tempDirectories: string[] = [];
const execFileAsync = promisify(execFile);

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

function requireWorkspacePath(workspace: { path: string | null }): string {
  if (!workspace.path) {
    throw new TypeError("Expected local workspace path to be available.");
  }

  return workspace.path;
}

describe("local workspace backend", () => {
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

    const backend = createLocalWorkspaceBackend({
      commandRunner: async ({ command, cwd }) => {
        hookCalls.push(`${command}@${cwd}`);
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      }
    });

    const first = await backend.prepareWorkspace({
      context: {
        issueId: "issue-1",
        issueIdentifier: "COL/200"
      },
      config: config.workspace,
      hooks: config.hooks
    });
    const second = await backend.prepareWorkspace({
      context: {
        issueId: "issue-1",
        issueIdentifier: "COL/200"
      },
      config: config.workspace,
      hooks: config.hooks
    });

    expect(first.path).toBe(second.path);
    expect(first.executionTarget).toEqual({
      kind: "host_path",
      path: requireWorkspacePath(first)
    });
    expect(first.materialization).toEqual({
      kind: "directory",
      hostPath: requireWorkspacePath(first)
    });
    expect(path.basename(requireWorkspacePath(first))).toBe("symphony-COL_200");
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(hookCalls).toHaveLength(1);
  });

  it("bootstraps a workspace through after_create hooks", async () => {
    const root = await createWorkspaceRoot();
    const templateRepo = path.join(root, "source");
    await mkdir(path.join(templateRepo, "keep"), {
      recursive: true
    });
    await writeFile(path.join(templateRepo, "README.md"), "hook clone\n");
    await writeFile(path.join(templateRepo, "keep", "file.txt"), "keep me");
    await initializeGitRepository(templateRepo, ["README.md", "keep/file.txt"]);

    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root: path.join(root, "workspaces")
      },
      hooks: {
        afterCreate: `git clone --depth 1 ${templateRepo} .`,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 5_000
      }
    });

    const backend = createLocalWorkspaceBackend();
    const workspace = await backend.prepareWorkspace({
      context: {
        issueId: "issue-bootstrap",
        issueIdentifier: "S-1"
      },
      config: config.workspace,
      hooks: config.hooks
    });

    expect(
      await readFile(path.join(requireWorkspacePath(workspace), "README.md"), "utf8")
    ).toBe(
      "hook clone\n"
    );
    expect(
      await readFile(path.join(requireWorkspacePath(workspace), "keep", "file.txt"), "utf8")
    ).toBe("keep me");
  });

  it("replaces stale non-directory workspace paths", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      }
    });
    const backend = createLocalWorkspaceBackend();
    const workspacePath = path.join(
      config.workspace.root,
      symphonyWorkspaceDirectoryName("COL-300")
    );

    await writeFile(workspacePath, "stale path");

    const workspace = await backend.prepareWorkspace({
      context: {
        issueId: "issue-300",
        issueIdentifier: "COL-300"
      },
      config: config.workspace,
      hooks: config.hooks
    });

    expect(workspace.created).toBe(true);
  });

  it("reuses repo-owned validated workspaces without rerunning after_create", async () => {
    const root = await createWorkspaceRoot();
    const workspaceRoot = path.join(root, "workspaces");
    const workspacePath = path.join(workspaceRoot, "symphony-COL-302");
    const hookCalls: string[] = [];

    await mkdir(path.join(workspacePath, ".symphony"), {
      recursive: true
    });
    await writeFile(
      path.join(workspacePath, ".symphony", "workspace.env"),
      "DATABASE_URL=postgres://example\n"
    );
    await writeFile(path.join(workspacePath, "README.md"), "existing\n");

    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root: workspaceRoot
      },
      hooks: {
        afterCreate: "echo should-not-run > after_create.txt",
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1_000
      }
    });

    const backend = createLocalWorkspaceBackend({
      commandRunner: async ({ command, cwd }) => {
        hookCalls.push(`${command}@${cwd}`);
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      }
    });

    const workspace = await backend.prepareWorkspace({
      context: {
        issueId: "issue-302",
        issueIdentifier: "COL-302"
      },
      config: config.workspace,
      hooks: config.hooks,
      env: {
        SYMPHONY_SOURCE_REPO: path.join(root, "source")
      }
    });

    expect(workspace.created).toBe(false);
    expect(requireWorkspacePath(workspace)).toBe(await realpath(workspacePath));
    expect(
      await readFile(path.join(requireWorkspacePath(workspace), "README.md"), "utf8")
    ).toBe(
      "existing\n"
    );
    expect(hookCalls).toHaveLength(0);
  });

  it("resets stale repo-owned directories missing metadata before rerunning after_create", async () => {
    const root = await createWorkspaceRoot();
    const workspaceRoot = path.join(root, "workspaces");
    const workspacePath = path.join(workspaceRoot, "symphony-COL-303");

    await mkdir(workspacePath, {
      recursive: true
    });
    await writeFile(path.join(workspacePath, "README.md"), "stale\n");
    await writeFile(path.join(workspacePath, "local-progress.txt"), "keep me if reused\n");

    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root: workspaceRoot
      },
      hooks: {
        afterCreate:
          "mkdir -p .symphony && echo DATABASE_URL=postgres://example > .symphony/workspace.env && echo bootstrapped > README.md",
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 5_000
      }
    });

    const backend = createLocalWorkspaceBackend();
    const workspace = await backend.prepareWorkspace({
      context: {
        issueId: "issue-303",
        issueIdentifier: "COL-303"
      },
      config: config.workspace,
      hooks: config.hooks,
      env: {
        SYMPHONY_SOURCE_REPO: path.join(root, "source")
      }
    });

    expect(workspace.created).toBe(true);
    expect(
      await readFile(path.join(requireWorkspacePath(workspace), "README.md"), "utf8")
    ).toBe(
      "bootstrapped\n"
    );
    await expect(
      readFile(path.join(requireWorkspacePath(workspace), "local-progress.txt"), "utf8")
    ).rejects.toMatchObject({
      code: "ENOENT"
    });
    expect(
      await readFile(
        path.join(requireWorkspacePath(workspace), ".symphony", "workspace.env"),
        "utf8"
      )
    ).toContain("DATABASE_URL=postgres://example");
  });

  it("rejects workspace symlink escapes under the configured root", async () => {
    const root = await createWorkspaceRoot();
    const workspaceRoot = path.join(root, "workspaces");
    const outsideRoot = path.join(root, "outside");
    const symlinkPath = path.join(workspaceRoot, "symphony-MT-SYM");

    await mkdir(workspaceRoot, {
      recursive: true
    });
    await mkdir(outsideRoot, {
      recursive: true
    });
    await symlink(outsideRoot, symlinkPath);

    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root: workspaceRoot
      }
    });
    const backend = createLocalWorkspaceBackend();

    await expect(
      backend.prepareWorkspace({
        context: {
          issueId: "issue-sym",
          issueIdentifier: "MT-SYM"
        },
        config: config.workspace,
        hooks: config.hooks
      })
    ).rejects.toMatchObject({
      code: "workspace_outside_root"
    });
  });

  it("canonicalizes symlinked workspace roots before creating issue directories", async () => {
    const root = await createWorkspaceRoot();
    const actualRoot = path.join(root, "actual-workspaces");
    const linkedRoot = path.join(root, "linked-workspaces");

    await mkdir(actualRoot, {
      recursive: true
    });
    await symlink(actualRoot, linkedRoot);

    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root: linkedRoot
      }
    });
    const backend = createLocalWorkspaceBackend();

    const workspace = await backend.prepareWorkspace({
      context: {
        issueId: "issue-link",
        issueIdentifier: "MT-LINK"
      },
      config: config.workspace,
      hooks: config.hooks
    });

    expect(requireWorkspacePath(workspace)).toBe(
      await realpath(path.join(actualRoot, "symphony-MT-LINK"))
    );
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

    const backend = createLocalWorkspaceBackend({
      commandRunner: async ({ command }) => ({
        exitCode: command === "exit 1" ? 1 : 0,
        stdout: "",
        stderr: "hook failed"
      })
    });

    const workspace = await backend.prepareWorkspace({
      context: {
        issueId: "issue-400",
        issueIdentifier: "COL-400"
      },
      config: config.workspace,
      hooks: {
        ...config.hooks,
        beforeRun: null
      }
    });

    await expect(
      backend.runBeforeRun({
        workspace,
        context: {
          issueId: "issue-400",
          issueIdentifier: "COL-400"
        },
        hooks: config.hooks
      })
    ).rejects.toThrowError(SymphonyWorkspaceError);

    await expect(
      backend.runAfterRun({
        workspace,
        context: {
          issueId: "issue-400",
          issueIdentifier: "COL-400"
        },
        hooks: config.hooks
      })
    ).resolves.toBeUndefined();
  });

  it("surfaces after_create hook failures and hook timeouts", async () => {
    const root = await createWorkspaceRoot();
    const failureConfig = buildSymphonyWorkflowConfig({
      workspace: {
        root
      },
      hooks: {
        afterCreate: "echo nope && exit 17",
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1_000
      }
    });

    const failureBackend = createLocalWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 17,
        stdout: "nope\n",
        stderr: ""
      })
    });

    await expect(
      failureBackend.prepareWorkspace({
        context: {
          issueId: "issue-fail",
          issueIdentifier: "MT-FAIL"
        },
        config: failureConfig.workspace,
        hooks: failureConfig.hooks
      })
    ).rejects.toMatchObject({
      code: "workspace_hook_failed"
    });

    const timeoutConfig = buildSymphonyWorkflowConfig({
      workspace: {
        root: path.join(root, "timeout")
      },
      hooks: {
        afterCreate: "sleep 1",
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 10
      }
    });

    const timeoutBackend = createLocalWorkspaceBackend({
      commandRunner: async () => {
        throw new SymphonyWorkspaceError(
          "workspace_hook_timeout",
          "Workspace hook timed out after 10ms."
        );
      }
    });

    await expect(
      timeoutBackend.prepareWorkspace({
        context: {
          issueId: "issue-timeout",
          issueIdentifier: "MT-TIMEOUT"
        },
        config: timeoutConfig.workspace,
        hooks: timeoutConfig.hooks
      })
    ).rejects.toMatchObject({
      code: "workspace_hook_timeout"
    });
  });
});

async function initializeGitRepository(
  repoPath: string,
  files: string[]
): Promise<void> {
  await execFileAsync("git", ["init", "-b", "main"], {
    cwd: repoPath
  });
  await execFileAsync("git", ["config", "user.name", "Test User"], {
    cwd: repoPath
  });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoPath
  });
  await execFileAsync("git", ["add", ...files], {
    cwd: repoPath
  });
  await execFileAsync("git", ["commit", "-m", "initial"], {
    cwd: repoPath
  });
}
