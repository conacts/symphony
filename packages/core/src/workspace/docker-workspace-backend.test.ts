import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { SymphonyWorkspaceError } from "./local-symphony-workspace-manager.js";
import {
  createDockerWorkspaceBackend,
  type PreparedWorkspace,
  type DockerWorkspaceCommandRunner
} from "./workspace-backend.js";
import { buildSymphonyWorkflowConfig } from "../test-support/build-symphony-workflow-config.js";

const tempDirectories: string[] = [];

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

async function createWorkspaceRoot(): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "symphony-docker-workspace-")
  );
  tempDirectories.push(directory);
  return directory;
}

describe("docker workspace backend", () => {
  it("creates deterministic container-backed workspaces and only runs after_create once", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      },
      hooks: {
        afterCreate: "echo bootstrapped > README.md",
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1_000
      }
    });
    const calls: Array<{
      args: string[];
      timeoutMs: number;
    }> = [];
    let inspectCallCount = 0;
    let observedContainerName: string | null = null;
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      shell: "bash",
      commandRunner: async (input) => {
        calls.push({
          args: [...input.args],
          timeoutMs: input.timeoutMs
        });

        switch (input.args[0]) {
          case "inspect":
            inspectCallCount += 1;
            if (inspectCallCount === 1) {
              return {
                exitCode: 1,
                stdout: "",
                stderr: `Error: No such object: ${input.args[3]}`
              };
            }

            observedContainerName = input.args[3] ?? null;

            return {
              exitCode: 0,
              stdout: buildDockerInspectPayload({
                id: "container-123",
                image: "ghcr.io/openai/symphony-workspace:latest",
                name: input.args[3] ?? "unknown",
                issueIdentifier: "COL/200",
                workspaceKey: "COL_200",
                hostPath: path.join(root, "symphony-COL_200"),
                workspacePath: "/home/agent/workspace",
                running: true
              }),
              stderr: ""
            };
          case "run":
            observedContainerName = input.args[3] ?? null;
            return {
              exitCode: 0,
              stdout: "container-123\n",
              stderr: ""
            };
          case "exec":
            return {
              exitCode: 0,
              stdout: "",
              stderr: ""
            };
          default:
            throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
        }
      }
    });

    const first = await backend.prepareWorkspace({
      context: {
        issueId: "issue-200",
        issueIdentifier: "COL/200"
      },
      config: config.workspace,
      hooks: config.hooks
    });
    const second = await backend.prepareWorkspace({
      context: {
        issueId: "issue-200",
        issueIdentifier: "COL/200"
      },
      config: config.workspace,
      hooks: config.hooks
    });

    const afterCreateCall = calls.find((call) => call.args[0] === "exec");
    const runCall = calls.find((call) => call.args[0] === "run");
    const firstTarget = requireContainerTarget(first);
    const expectedHostPath = await realpath(path.join(root, "symphony-COL_200"));

    expect(first).toEqual({
      issueIdentifier: "COL/200",
      workspaceKey: "COL_200",
      backendKind: "docker",
      executionTarget: {
        kind: "container",
        workspacePath: "/home/agent/workspace",
        containerId: "container-123",
        containerName: observedContainerName,
        hostPath: expectedHostPath
      },
      materialization: {
        kind: "bind_mount",
        hostPath: expectedHostPath,
        containerPath: "/home/agent/workspace"
      },
      path: null,
      created: true,
      workerHost: null
    });
    expect(second).toEqual({
      ...first,
      created: false
    });
    expect(firstTarget.containerName).toMatch(
      /^symphony-workspace-col_200-[0-9a-f]{8}$/
    );
    expect(afterCreateCall?.args).toEqual(
      expect.arrayContaining([
        "exec",
        "--env",
        "SYMPHONY_WORKSPACE_PATH=/home/agent/workspace",
        "--env",
        "SYMPHONY_ISSUE_IDENTIFIER=COL/200",
        "--env",
        "SYMPHONY_ISSUE_ID=issue-200",
        "--workdir",
        "/home/agent/workspace",
        firstTarget.containerName ?? "",
        "bash",
        "-lc",
        "echo bootstrapped > README.md"
      ])
    );
    expect(runCall?.args).toEqual(
      expect.arrayContaining([
        "--entrypoint",
        "bash",
        "ghcr.io/openai/symphony-workspace:latest",
        "-lc"
      ])
    );
    expect(calls.filter((call) => call.args[0] === "exec")).toHaveLength(1);
  });

  it("recreates stopped managed containers while reusing the bind-mounted workspace", async () => {
    const root = await createWorkspaceRoot();
    const workspacePath = path.join(root, "symphony-COL-201");
    await mkdir(workspacePath, {
      recursive: true
    });
    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      }
    });
    const calls: string[][] = [];
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      commandRunner: async (input) => {
        calls.push([...input.args]);

        switch (input.args[0]) {
          case "inspect":
            return {
              exitCode: 0,
              stdout: buildDockerInspectPayload({
                id: "container-stale",
                image: "ghcr.io/openai/symphony-workspace:latest",
                name: input.args[3] ?? "unknown",
                issueIdentifier: "COL-201",
                workspaceKey: "COL-201",
                hostPath: workspacePath,
                workspacePath: "/home/agent/workspace",
                running: false,
                status: "exited"
              }),
              stderr: ""
            };
          case "rm":
            return {
              exitCode: 0,
              stdout: "",
              stderr: ""
            };
          case "run":
            return {
              exitCode: 0,
              stdout: "container-fresh\n",
              stderr: ""
            };
          default:
            throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
        }
      }
    });

    const workspace = await backend.prepareWorkspace({
      context: {
        issueId: "issue-201",
        issueIdentifier: "COL-201"
      },
      config: config.workspace,
      hooks: config.hooks
    });

    expect(workspace.created).toBe(false);
    expect(requireContainerTarget(workspace).containerId).toBe("container-fresh");
    expect(calls.map((call) => call[0])).toEqual(["inspect", "inspect", "rm", "run"]);
  });

  it("fails closed on before_run hook errors and swallows after_run failures", async () => {
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      commandRunner: createSequentialRunner([
        {
          exitCode: 17,
          stdout: "before failed\n",
          stderr: "hook failed"
        },
        {
          exitCode: 19,
          stdout: "after failed\n",
          stderr: "hook failed"
        }
      ])
    });
    const workspace = buildPreparedDockerWorkspace({
      issueIdentifier: "COL-202",
      workspaceKey: "COL-202",
      containerId: "container-202",
      containerName: "symphony-workspace-col-202-deadbeef",
      hostPath: "/tmp/symphony-COL-202"
    });
    const hooks = buildSymphonyWorkflowConfig({
      hooks: {
        afterCreate: null,
        beforeRun: "exit 17",
        afterRun: "exit 19",
        beforeRemove: null,
        timeoutMs: 1_000
      }
    }).hooks;

    await expect(
      backend.runBeforeRun({
        workspace,
        context: {
          issueId: "issue-202",
          issueIdentifier: "COL-202"
        },
        hooks,
        env: {
          FEATURE_FLAG: "enabled"
        },
        workerHost: "docker-host-a"
      })
    ).rejects.toThrowError(SymphonyWorkspaceError);

    await expect(
      backend.runAfterRun({
        workspace,
        context: {
          issueId: "issue-202",
          issueIdentifier: "COL-202"
        },
        hooks,
        env: {
          FEATURE_FLAG: "enabled"
        },
        workerHost: "docker-host-a"
      })
    ).resolves.toBeUndefined();
  });

  it("runs before_remove best effort and removes the managed container and host workspace", async () => {
    const root = await createWorkspaceRoot();
    const workspacePath = path.join(root, "symphony-COL-203");
    await mkdir(workspacePath, {
      recursive: true
    });
    await writeFile(path.join(workspacePath, "README.md"), "hello\n");

    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      },
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: "echo cleanup",
        timeoutMs: 1_000
      }
    });
    const calls: string[][] = [];
    let inspectCount = 0;
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      commandRunner: async (input) => {
        calls.push([...input.args]);

        switch (input.args[0]) {
          case "inspect":
            inspectCount += 1;
            return {
              exitCode: 0,
              stdout: buildDockerInspectPayload({
                id: "container-203",
                image: "ghcr.io/openai/symphony-workspace:latest",
                name: input.args[3] ?? "unknown",
                issueIdentifier: "COL-203",
                workspaceKey: "COL-203",
                hostPath: workspacePath,
                workspacePath: "/home/agent/workspace",
                running: true
              }),
              stderr: ""
            };
          case "exec":
            return {
              exitCode: 5,
              stdout: "",
              stderr: "cleanup hook failed"
            };
          case "rm":
            return {
              exitCode: 0,
              stdout: "",
              stderr: ""
            };
          default:
            throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
        }
      }
    });

    await expect(
      backend.cleanupWorkspace({
        issueIdentifier: "COL-203",
        workspace: {
          ...buildPreparedDockerWorkspace({
            issueIdentifier: "COL-203",
            workspaceKey: "COL-203",
            containerId: "container-203",
            containerName: "symphony-workspace-col-203-deadbeef",
            hostPath: workspacePath
          }),
          executionTarget: {
            kind: "container" as const,
            workspacePath: "/custom/worktree",
            containerId: "container-203",
            containerName: "symphony-workspace-col-203-deadbeef",
            hostPath: workspacePath
          },
          materialization: {
            kind: "bind_mount" as const,
            hostPath: workspacePath,
            containerPath: "/custom/worktree"
          }
        },
        config: config.workspace,
        hooks: config.hooks
      })
    ).resolves.toBeUndefined();

    await expect(rm(workspacePath, { recursive: true, force: false })).rejects.toMatchObject(
      {
        code: "ENOENT"
      }
    );
    expect(calls[1]).toEqual(
      expect.arrayContaining(["exec", "--workdir", "/custom/worktree"])
    );
    expect(inspectCount).toBe(2);
    expect(calls.map((call) => call[0])).toEqual(["inspect", "exec", "inspect", "rm"]);
  });
});

function buildPreparedDockerWorkspace(input: {
  issueIdentifier: string;
  workspaceKey: string;
  containerId: string;
  containerName: string;
  hostPath: string;
}) {
  return {
    issueIdentifier: input.issueIdentifier,
    workspaceKey: input.workspaceKey,
    backendKind: "docker" as const,
    executionTarget: {
      kind: "container" as const,
      workspacePath: "/home/agent/workspace",
      containerId: input.containerId,
      containerName: input.containerName,
      hostPath: input.hostPath
    },
    materialization: {
      kind: "bind_mount" as const,
      hostPath: input.hostPath,
      containerPath: "/home/agent/workspace"
    },
    path: null,
    created: false,
    workerHost: null
  };
}

function requireContainerTarget(
  workspace: PreparedWorkspace
): Extract<PreparedWorkspace["executionTarget"], { kind: "container" }> {
  if (workspace.executionTarget.kind === "container") {
    return workspace.executionTarget;
  }

  throw new TypeError("Expected a container execution target.");
}

function createSequentialRunner(
  results: Array<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>
): DockerWorkspaceCommandRunner {
  const queue = [...results];

  return async () => {
    const next = queue.shift();
    if (!next) {
      throw new Error("Unexpected docker command.");
    }

    return next;
  };
}

function buildDockerInspectPayload(input: {
  id: string;
  image: string;
  name: string;
  issueIdentifier: string;
  workspaceKey: string;
  hostPath: string;
  workspacePath: string;
  running: boolean;
  status?: string;
}): string {
  return JSON.stringify([
    {
      Id: input.id,
      Name: `/${input.name}`,
      State: {
        Running: input.running,
        Status: input.status ?? (input.running ? "running" : "exited")
      },
      Config: {
        Image: input.image,
        Labels: {
          "dev.symphony.workspace-backend": "docker",
          "dev.symphony.workspace-key": input.workspaceKey,
          "dev.symphony.issue-identifier": input.issueIdentifier,
          "dev.symphony.materialization": "bind_mount"
        }
      },
      Mounts: [
        {
          Type: "bind",
          Source: input.hostPath,
          Destination: input.workspacePath,
          Name: null
        }
      ]
    }
  ]);
}
