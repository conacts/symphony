import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { SymphonyWorkspaceError } from "./workspace-identity.js";
import {
  createDockerWorkspaceBackend,
  type PreparedWorkspace,
  type DockerWorkspaceCommandRunner
} from "./workspace-backend.js";
import {
  normalizeSymphonyRuntimeManifest,
  type SymphonyLoadedRuntimeManifest,
  type SymphonyRuntimeStep
} from "@symphony/runtime-contract";
import type {
  WorkspaceConfig,
  WorkspaceHooksConfig
} from "./workspace-contracts.js";

const tempDirectories: string[] = [];

function buildWorkspaceTestConfig(overrides: {
  workspace?: Partial<WorkspaceConfig>;
  hooks?: Partial<WorkspaceHooksConfig>;
} = {}): {
  workspace: WorkspaceConfig;
  hooks: WorkspaceHooksConfig;
} {
  return {
    workspace: {
      root:
        overrides.workspace?.root ??
        path.join(tmpdir(), "symphony-test-workspaces")
    },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1_000,
      ...overrides.hooks
    }
  };
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

async function createWorkspaceRoot(): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "symphony-docker-workspace-")
  );
  tempDirectories.push(directory);
  return directory;
}

describe("docker workspace backend", () => {
  it("mounts explicit host auth material into the container contract", async () => {
    const root = await createWorkspaceRoot();
    const config = buildWorkspaceTestConfig({
      workspace: {
        root
      }
    });
    const calls: string[][] = [];
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      hostFileMounts: [
        {
          sourcePath: "/Users/test/.codex/auth.json",
          containerPath: "/home/agent/auth.json",
          readOnly: true
        },
        {
          sourcePath: "/Users/test/.local/share/opencode/auth.json",
          containerPath: "/home/agent/.local/share/opencode/auth.json",
          readOnly: true
        }
      ],
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (input.args[0] === "inspect") {
          return {
            exitCode: 1,
            stdout: "[]\n",
            stderr: `Error response from daemon: No such container: ${input.args[3]}`
          };
        }

        if (input.args[0] === "run") {
          return {
            exitCode: 0,
            stdout: "container-auth-123\n",
            stderr: ""
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    await backend.prepareWorkspace({
      context: {
        issueId: "issue-auth-200",
        issueIdentifier: "COL/200"
      },
      config: config.workspace,
      hooks: {
        ...config.hooks,
        afterCreate: null
      }
    });

    expect(calls.find((call) => call[0] === "run")).toEqual(
      expect.arrayContaining([
        "--mount",
        "type=bind,src=/Users/test/.codex/auth.json,dst=/home/agent/auth.json,readonly",
        "--mount",
        "type=bind,src=/Users/test/.local/share/opencode/auth.json,dst=/home/agent/.local/share/opencode/auth.json,readonly"
      ])
    );
  });

  it("creates deterministic container-backed workspaces and only runs after_create once", async () => {
    const root = await createWorkspaceRoot();
    const config = buildWorkspaceTestConfig({
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
                stdout: "[]\n",
                stderr: `Error response from daemon: No such container: ${input.args[3]}`
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
      prepareDisposition: "created",
      containerDisposition: "started",
      networkDisposition: "not_applicable",
      afterCreateHookOutcome: "completed",
      executionTarget: {
        kind: "container",
        workspacePath: "/home/agent/workspace",
        containerId: "container-123",
        containerName: observedContainerName,
        hostPath: expectedHostPath,
        shell: "bash"
      },
      materialization: {
        kind: "bind_mount",
        hostPath: expectedHostPath,
        containerPath: "/home/agent/workspace"
      },
      networkName: null,
      services: [],
      envBundle: {
        ...ambientEnvBundle(),
        values: {
          NODE_OPTIONS: "--max-old-space-size=2048"
        }
      },
      manifestLifecycle: null,
      path: null,
      created: true,
      workerHost: null
    });
    expect(second).toEqual({
      ...first,
      prepareDisposition: "reused",
      containerDisposition: "reused",
      afterCreateHookOutcome: "skipped",
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

  it("hydrates an empty workspace from the configured source repo before lifecycle runs", async () => {
    const root = await createWorkspaceRoot();
    const sourceRepoPath = path.join(root, "source-repo");
    await mkdir(sourceRepoPath, {
      recursive: true
    });

    const calls: string[][] = [];
    const lifecycleEvents: string[] = [];
    let inspectCallCount = 0;
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      shell: "bash",
      sourceRepoPath,
      commandRunner: async (input) => {
        calls.push([...input.args]);

        switch (input.args[0]) {
          case "inspect":
            inspectCallCount += 1;
            if (inspectCallCount === 1) {
              return {
                exitCode: 1,
                stdout: "[]\n",
                stderr: `Error response from daemon: No such container: ${input.args[3]}`
              };
            }

            return {
              exitCode: 0,
              stdout: buildDockerInspectPayload({
                id: "container-201",
                image: "ghcr.io/openai/symphony-workspace:latest",
                name: input.args[3] ?? "unknown",
                issueIdentifier: "COL-201",
                workspaceKey: "COL-201",
                hostPath: path.join(root, "symphony-COL-201"),
                workspacePath: "/home/agent/workspace",
                running: true
              }),
              stderr: ""
            };
          case "run":
            return {
              exitCode: 0,
              stdout: "container-201\n",
              stderr: ""
            };
          case "exec":
            return input.args.at(-1)?.includes("git clone --no-local")
              ? {
                  exitCode: 0,
                  stdout: "hydrated\n",
                  stderr: ""
                }
              : {
                  exitCode: 0,
                  stdout: "",
                  stderr: ""
                };
          default:
            throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
        }
      }
    });

    await backend.prepareWorkspace({
      context: {
        issueId: "issue-201",
        issueIdentifier: "COL-201",
        branchName: "feature/demo"
      },
      config: buildWorkspaceTestConfig({
        workspace: {
          root
        }
      }).workspace,
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1_000
      },
      lifecycleRecorder(event) {
        lifecycleEvents.push(event.eventType);
      }
    });

    expect(calls.find((call) => call[0] === "run")).toEqual(
      expect.arrayContaining([
        "--mount",
        `type=bind,src=${sourceRepoPath},dst=/home/agent/source-repo,readonly`
      ])
    );
    expect(
      calls.find(
        (call) => call[0] === "exec" && call.at(-1)?.includes("git clone --no-local")
      )?.at(-1)
    ).toContain("feature/demo");
    expect(lifecycleEvents).toEqual([
      "workspace_repo_hydration_started",
      "workspace_repo_hydration_completed"
    ]);
  });

  it("prepares volume-backed workspaces without fabricating a host repo path", async () => {
    const root = await createWorkspaceRoot();
    const config = buildWorkspaceTestConfig({
      workspace: {
        root
      }
    });
    const calls: string[][] = [];
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      materializationMode: "volume",
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (
          input.args[0] === "volume" &&
          input.args[1] === "inspect"
        ) {
          return {
            exitCode: 1,
            stdout: "[]\n",
            stderr: `Error response from daemon: No such volume: ${input.args[2]}`
          };
        }

        if (input.args[0] === "volume" && input.args[1] === "create") {
          return {
            exitCode: 0,
            stdout: `${input.args.at(-1) ?? "volume"}\n`,
            stderr: ""
          };
        }

        if (input.args[0] === "inspect" && input.args[1] === "--type") {
          if (input.args[3]?.includes("workspace")) {
            return {
              exitCode: 1,
              stdout: "[]\n",
              stderr: `Error response from daemon: No such container: ${input.args[3]}`
            };
          }

          return {
            exitCode: 0,
            stdout: buildDockerInspectPayload({
              id: "container-volume-123",
              image: "ghcr.io/openai/symphony-workspace:latest",
              name: input.args[3] ?? "unknown",
              issueIdentifier: "COL-207",
              workspaceKey: "COL-207",
              hostPath: null,
              volumeName: "symphony-workspace-col-207-deadbeef",
              workspacePath: "/home/agent/workspace",
              running: true,
              materializationKind: "volume"
            }),
            stderr: ""
          };
        }

        if (input.args[0] === "run") {
          return {
            exitCode: 0,
            stdout: "container-volume-123\n",
            stderr: ""
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    const workspace = await backend.prepareWorkspace({
      context: {
        issueId: "issue-207",
        issueIdentifier: "COL-207"
      },
      config: config.workspace,
      hooks: config.hooks
    });

    expect(workspace.executionTarget).toEqual({
      kind: "container",
      workspacePath: "/home/agent/workspace",
      containerId: "container-volume-123",
      containerName: expect.stringMatching(
        /^symphony-workspace-col-207-[0-9a-f]{8}$/
      ),
      hostPath: null,
      shell: "bash"
    });
    expect(workspace.materialization).toEqual({
      kind: "volume",
      volumeName: expect.stringMatching(
        /^symphony-workspace-volume-col-207-[0-9a-f]{8}$/
      ),
      containerPath: "/home/agent/workspace",
      hostPath: null
    });
    expect(
      calls.some((call) => {
        if (call[0] !== "volume" || call[1] !== "create") {
          return false;
        }

        const labels = new Set(call);
        return (
          labels.has("dev.symphony.workspace-backend=docker") &&
          labels.has("dev.symphony.workspace-key=COL-207") &&
          labels.has("dev.symphony.issue-identifier=COL-207") &&
          labels.has("dev.symphony.materialization=volume") &&
          labels.has("dev.symphony.managed-kind=workspace_volume")
        );
      })
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call[0] === "run" &&
          call.includes("--mount") &&
          call.some((arg) => arg.includes("type=volume"))
      )
    ).toBe(true);
    expect(
      calls.some(
        (call) => call[0] === "run" && call.includes("--user")
      )
    ).toBe(false);
  });

  it("cleans up volume-backed workspaces without a host repo path", async () => {
    const root = await createWorkspaceRoot();
    const config = buildWorkspaceTestConfig({
      workspace: {
        root
      }
    });
    const calls: string[][] = [];
    const volumeName = "symphony-workspace-col-208-deadbeef";
    const containerName = "symphony-workspace-col-208-deadbeef";
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      materializationMode: "volume",
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (input.args[0] === "inspect" && input.args[1] === "--type") {
          return {
            exitCode: 0,
            stdout: buildDockerInspectPayload({
              id: "container-volume-208",
              image: "ghcr.io/openai/symphony-workspace:latest",
              name: containerName,
              issueIdentifier: "COL-208",
              workspaceKey: "COL-208",
              hostPath: null,
              volumeName,
              workspacePath: "/home/agent/workspace",
              running: true,
              materializationKind: "volume"
            }),
            stderr: ""
          };
        }

        if (input.args[0] === "rm") {
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        if (
          input.args[0] === "volume" &&
          input.args[1] === "inspect"
        ) {
          return {
            exitCode: 0,
            stdout: buildDockerVolumeInspectPayload({
              name: volumeName,
              issueIdentifier: "COL-208",
              workspaceKey: "COL-208",
              materializationKind: "volume"
            }),
            stderr: ""
          };
        }

        if (input.args[0] === "volume" && input.args[1] === "rm") {
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    const workspace = buildPreparedDockerWorkspace({
      issueIdentifier: "COL-208",
      workspaceKey: "COL-208",
      containerId: "container-volume-208",
      containerName,
      hostPath: null,
      materializationKind: "volume",
      volumeName
    });

    const cleanup = await backend.cleanupWorkspace({
      issueIdentifier: "COL-208",
      config: config.workspace,
      hooks: config.hooks,
      workspace
    });

    expect(cleanup.hostPath).toBeNull();
    expect(cleanup.runtimePath).toBe("/home/agent/workspace");
    expect(cleanup.workspaceRemovalDisposition).toBe("removed");
    expect(
      calls.some(
        (call) => call[0] === "volume" && call[1] === "rm" && call[2] === volumeName
      )
    ).toBe(true);
  });

  it("restarts stopped managed containers while reusing the bind-mounted workspace", async () => {
    const root = await createWorkspaceRoot();
    const workspacePath = path.join(root, "symphony-COL-201");
    await mkdir(workspacePath, {
      recursive: true
    });
    const config = buildWorkspaceTestConfig({
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
                running: calls.some((call) => call[0] === "start"),
                status: calls.some((call) => call[0] === "start") ? "running" : "exited"
              }),
              stderr: ""
            };
          case "start":
            return {
              exitCode: 0,
              stdout: "container-stale\n",
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
    expect(requireContainerTarget(workspace).containerId).toBe("container-stale");
    expect(calls.map((call) => call[0])).toEqual(["inspect", "start", "inspect"]);
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
    const hooks = buildWorkspaceTestConfig({
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
    ).resolves.toEqual({
      hookKind: "after_run",
      outcome: "failed_ignored"
    });
  });

  it("runs before_remove best effort and removes the managed container and host workspace", async () => {
    const root = await createWorkspaceRoot();
    const workspacePath = path.join(root, "symphony-COL-203");
    await mkdir(workspacePath, {
      recursive: true
    });
    await writeFile(path.join(workspacePath, "README.md"), "hello\n");

    const config = buildWorkspaceTestConfig({
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
            hostPath: workspacePath,
            shell: "bash"
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
    ).resolves.toEqual({
      backendKind: "docker",
      workerHost: null,
      hostPath: workspacePath,
      runtimePath: "/custom/worktree",
      containerId: "container-203",
      containerName: "symphony-workspace-col-203-deadbeef",
      networkName: null,
      networkRemovalDisposition: "not_applicable",
      serviceCleanup: [],
      beforeRemoveHookOutcome: "failed_ignored",
      manifestLifecycleCleanup: null,
      workspaceRemovalDisposition: "removed",
      containerRemovalDisposition: "removed"
    });

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

  it("swallows missing-container rm responses during cleanup", async () => {
    const root = await createWorkspaceRoot();
    const workspacePath = path.join(root, "symphony-COL-204");
    await mkdir(workspacePath, {
      recursive: true
    });

    const config = buildWorkspaceTestConfig({
      workspace: {
        root
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
                id: "container-204",
                image: "ghcr.io/openai/symphony-workspace:latest",
                name: input.args[3] ?? "unknown",
                issueIdentifier: "COL-204",
                workspaceKey: "COL-204",
                hostPath: workspacePath,
                workspacePath: "/home/agent/workspace",
                running: true
              }),
              stderr: ""
            };
          case "rm":
            return {
              exitCode: 1,
              stdout: "",
              stderr: `Error response from daemon: No such container: ${input.args[2]}`
            };
          default:
            throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
        }
      }
    });

    await expect(
      backend.cleanupWorkspace({
        issueIdentifier: "COL-204",
        workspace: buildPreparedDockerWorkspace({
          issueIdentifier: "COL-204",
          workspaceKey: "COL-204",
          containerId: "container-204",
          containerName: "symphony-workspace-col-204-deadbeef",
          hostPath: workspacePath
        }),
        config: config.workspace,
        hooks: config.hooks
      })
    ).resolves.toEqual({
      backendKind: "docker",
      workerHost: null,
      hostPath: workspacePath,
      runtimePath: "/home/agent/workspace",
      containerId: "container-204",
      containerName: "symphony-workspace-col-204-deadbeef",
      networkName: null,
      networkRemovalDisposition: "not_applicable",
      serviceCleanup: [],
      beforeRemoveHookOutcome: "skipped",
      manifestLifecycleCleanup: null,
      workspaceRemovalDisposition: "removed",
      containerRemovalDisposition: "missing"
    });

    await expect(rm(workspacePath, { recursive: true, force: false })).rejects.toMatchObject(
      {
        code: "ENOENT"
      }
    );
    expect(inspectCount).toBe(2);
    expect(calls.map((call) => call[0])).toEqual(["inspect", "inspect", "rm"]);
  });

  it("reports missing workspace removal when before_remove already removed the host path", async () => {
    const root = await createWorkspaceRoot();
    const workspacePath = path.join(root, "symphony-COL-205");
    await mkdir(workspacePath, {
      recursive: true
    });

    const config = buildWorkspaceTestConfig({
      workspace: {
        root
      },
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: "rm -rf /workspace",
        timeoutMs: 1_000
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
                id: "container-205",
                image: "ghcr.io/openai/symphony-workspace:latest",
                name: input.args[3] ?? "unknown",
                issueIdentifier: "COL-205",
                workspaceKey: "COL-205",
                hostPath: workspacePath,
                workspacePath: "/home/agent/workspace",
                running: true
              }),
              stderr: ""
            };
          case "exec":
            await rm(workspacePath, {
              recursive: true,
              force: true
            });
            return {
              exitCode: 0,
              stdout: "",
              stderr: ""
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
        issueIdentifier: "COL-205",
        workspace: buildPreparedDockerWorkspace({
          issueIdentifier: "COL-205",
          workspaceKey: "COL-205",
          containerId: "container-205",
          containerName: "symphony-workspace-col-205-deadbeef",
          hostPath: workspacePath
        }),
        config: config.workspace,
        hooks: config.hooks
      })
    ).resolves.toEqual({
      backendKind: "docker",
      workerHost: null,
      hostPath: workspacePath,
      runtimePath: "/home/agent/workspace",
      containerId: "container-205",
      containerName: "symphony-workspace-col-205-deadbeef",
      networkName: null,
      networkRemovalDisposition: "not_applicable",
      serviceCleanup: [],
      beforeRemoveHookOutcome: "completed",
      manifestLifecycleCleanup: null,
      workspaceRemovalDisposition: "missing",
      containerRemovalDisposition: "removed"
    });

    expect(calls.map((call) => call[0])).toEqual(["inspect", "exec", "inspect", "rm"]);
  });

  it("resolves shared postgres through a derived workspace database and drops it on cleanup", async () => {
    const root = await createWorkspaceRoot();
    const config = buildWorkspaceTestConfig({
      workspace: {
        root
      }
    });
    const runtimeManifest = buildLoadedRuntimeManifest({
      init: [
        {
          name: "extensions",
          run: "psql \"$DATABASE_URL\" -c 'select 1'",
          timeoutMs: 15_000
        }
      ]
    });
    const sharedPostgres = buildSharedPostgresConfig();
    const calls: string[][] = [];
    let sharedContainerExists = false;
    let workspaceContainerExists = false;
    let databaseExists = false;

    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      sharedPostgres,
      shell: "bash",
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (input.args[0] === "inspect") {
          const name = input.args[3] ?? "";

          if (name === sharedPostgres.containerName) {
            if (!sharedContainerExists) {
              return {
                exitCode: 1,
                stdout: "[]\n",
                stderr: `Error response from daemon: No such container: ${name}`
              };
            }

            return {
              exitCode: 0,
              stdout: buildDockerSharedServiceInspectPayload({
                id: "shared-postgres-401",
                name,
                image: sharedPostgres.image,
                adminDatabase: sharedPostgres.adminDatabase,
                adminUsername: sharedPostgres.adminUsername,
                adminPassword: sharedPostgres.adminPassword,
                containerPort: sharedPostgres.containerPort
              }),
              stderr: ""
            };
          }

          if (!workspaceContainerExists) {
            return {
              exitCode: 1,
              stdout: "[]\n",
              stderr: `Error response from daemon: No such container: ${name}`
            };
          }

          return {
            exitCode: 0,
            stdout: buildDockerInspectPayload({
              id: "workspace-401",
              image: "ghcr.io/openai/symphony-workspace:latest",
              name,
              issueIdentifier: "COL-401",
              workspaceKey: "COL-401",
              hostPath: path.join(root, "symphony-COL-401"),
              workspacePath: "/home/agent/workspace",
              running: true
            }),
            stderr: ""
          };
        }

        if (input.args[0] === "run") {
          if (input.args.includes("postgres:16")) {
            sharedContainerExists = true;
            return {
              exitCode: 0,
              stdout: "shared-postgres-401\n",
              stderr: ""
            };
          }

          workspaceContainerExists = true;
          return {
            exitCode: 0,
            stdout: "workspace-401\n",
            stderr: ""
          };
        }

        if (input.args[0] === "exec") {
          const script = input.args.at(-1) ?? "";

          if (script.includes("pg_isready")) {
            return {
              exitCode: 0,
              stdout: "",
              stderr: ""
            };
          }

          if (script.includes("SELECT 1 FROM pg_database")) {
            return {
              exitCode: 0,
              stdout: databaseExists ? "1\n" : "",
              stderr: ""
            };
          }

          if (script.includes("CREATE DATABASE")) {
            databaseExists = true;
            return {
              exitCode: 0,
              stdout: "",
              stderr: ""
            };
          }

          if (script.includes("DROP DATABASE")) {
            databaseExists = false;
            return {
              exitCode: 0,
              stdout: "",
              stderr: ""
            };
          }

          if (script.includes("DO $$")) {
            return {
              exitCode: 0,
              stdout: "",
              stderr: ""
            };
          }

          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        if (input.args[0] === "rm") {
          workspaceContainerExists = false;
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    const workspace = await backend.prepareWorkspace({
      context: {
        issueId: "issue-401",
        issueIdentifier: "COL-401"
      },
      runId: "run-401",
      config: config.workspace,
      hooks: config.hooks,
      env: {
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    const databaseUrl = workspace.envBundle.values.DATABASE_URL;
    expect(workspace.networkDisposition).toBe("not_applicable");
    expect(workspace.networkName).toBeNull();
    expect(workspace.services).toEqual([
      {
        key: "postgres",
        type: "postgres",
        hostname: "host.docker.internal",
        port: 55_432,
        containerId: "shared-postgres-401",
        containerName: "symphony-shared-postgres",
        disposition: "created"
      }
    ]);
    expect(databaseUrl).toMatch(
      /^postgresql:\/\/app:secret@host\.docker\.internal:55432\/symphony_postgres_col_401_[a-f0-9]{10}$/
    );
    expect(
      calls.some(
        (call) =>
          call[0] === "run" &&
          call.includes("--add-host") &&
          call.includes("host.docker.internal:host-gateway") &&
          !call.includes("--network")
      )
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call[0] === "exec" &&
          call.includes("symphony-shared-postgres") &&
          call.includes(`DATABASE_URL=${databaseUrl?.replace("host.docker.internal:55432", "127.0.0.1:5432")}`)
      )
    ).toBe(true);

    const cleanup = await backend.cleanupWorkspace({
      issueIdentifier: "COL-401",
      runId: "run-401",
      workspace,
      config: config.workspace,
      hooks: config.hooks,
      env: {
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    expect(cleanup.networkRemovalDisposition).toBe("not_applicable");
    expect(cleanup.serviceCleanup).toEqual([
      {
        key: "postgres",
        type: "postgres",
        containerId: "shared-postgres-401",
        containerName: "symphony-shared-postgres",
        removalDisposition: "removed"
      }
    ]);
  });

  it("executes shared-postgres manifest lifecycle phases and skips them on warm reuse", async () => {
    const root = await createWorkspaceRoot();
    const runtimeManifest = buildLoadedRuntimeManifest({
      init: [],
      lifecycle: {
        bootstrap: [{ name: "install", run: "pnpm install --frozen-lockfile" }],
        migrate: [{ name: "migrate", run: "pnpm db:migrate" }],
        seed: [{ name: "seed", run: "pnpm db:seed" }],
        verify: [{ name: "verify", run: "pnpm test:smoke" }]
      }
    });
    const mock = createSharedPostgresMock({
      root,
      issueIdentifier: "COL-511",
      runtimeManifest
    });
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      sharedPostgres: buildSharedPostgresConfig(),
      commandRunner: mock.runner
    });

    const first = await backend.prepareWorkspace({
      context: { issueId: "issue-511", issueIdentifier: "COL-511" },
      runId: "run-511a",
      config: buildWorkspaceTestConfig({ workspace: { root } }).workspace,
      hooks: buildWorkspaceTestConfig().hooks,
      env: { OPENAI_API_KEY: "test-openai-key", GITHUB_TOKEN: "test-github-token" }
    });
    const second = await backend.prepareWorkspace({
      context: { issueId: "issue-511", issueIdentifier: "COL-511" },
      runId: "run-511b",
      config: buildWorkspaceTestConfig({ workspace: { root } }).workspace,
      hooks: buildWorkspaceTestConfig().hooks,
      env: { OPENAI_API_KEY: "test-openai-key", GITHUB_TOKEN: "test-github-token" }
    });

    expect(mock.lifecycleCommands()).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm db:migrate",
      "pnpm db:seed",
      "pnpm test:smoke"
    ]);
    expect(first.manifestLifecycle?.phases).toMatchObject([
      { phase: "bootstrap", status: "completed" },
      { phase: "migrate", status: "completed" },
      { phase: "seed", status: "completed" },
      { phase: "verify", status: "completed" }
    ]);
    expect(second.manifestLifecycle?.phases).toMatchObject([
      { phase: "bootstrap", status: "skipped" },
      { phase: "migrate", status: "skipped" },
      { phase: "seed", status: "skipped" },
      { phase: "verify", status: "skipped" }
    ]);
  });

  it("fails fast on shared-postgres bootstrap step failures and redacts injected secrets", async () => {
    const root = await createWorkspaceRoot();
    const runtimeManifest = buildLoadedRuntimeManifest({
      init: [],
      lifecycle: {
        bootstrap: [{ name: "install", run: "pnpm install --frozen-lockfile" }],
        migrate: [{ name: "migrate", run: "pnpm db:migrate" }],
        verify: [{ name: "verify", run: "pnpm test:smoke" }]
      }
    });
    const mock = createSharedPostgresMock({
      root,
      issueIdentifier: "COL-512",
      runtimeManifest,
      commandFailures: {
        "pnpm install --frozen-lockfile": {
          exitCode: 17,
          stdout: "OPENAI_API_KEY=test-openai-key",
          stderr: "DATABASE_URL=postgresql://app:secret@host.docker.internal:55432/example"
        }
      }
    });
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      sharedPostgres: buildSharedPostgresConfig(),
      commandRunner: mock.runner
    });

    await expect(
      backend.prepareWorkspace({
        context: { issueId: "issue-512", issueIdentifier: "COL-512" },
        runId: "run-512",
        config: buildWorkspaceTestConfig({ workspace: { root } }).workspace,
        hooks: buildWorkspaceTestConfig().hooks,
        env: { OPENAI_API_KEY: "test-openai-key" }
      })
    ).rejects.toThrowError(/bootstrap\/install failed/i);
  });

  it("fails closed when shared postgres readiness never succeeds", async () => {
    const root = await createWorkspaceRoot();
    const runtimeManifest = buildLoadedRuntimeManifest({
      readiness: {
        retries: 1,
        intervalMs: 1,
        timeoutMs: 50
      }
    });
    const mock = createSharedPostgresMock({
      root,
      issueIdentifier: "COL-513",
      runtimeManifest,
      readinessFailures: 1
    });
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      sharedPostgres: buildSharedPostgresConfig(),
      commandRunner: mock.runner
    });

    await expect(
      backend.prepareWorkspace({
        context: { issueId: "issue-513", issueIdentifier: "COL-513" },
        config: buildWorkspaceTestConfig({ workspace: { root } }).workspace,
        hooks: buildWorkspaceTestConfig().hooks,
        env: { OPENAI_API_KEY: "test-openai-key" }
      })
    ).rejects.toThrowError(/Postgres service postgres failed readiness after 1 attempts/i);
  });

  it("preserves shared postgres during preserve cleanup and marks the service preserved", async () => {
    const root = await createWorkspaceRoot();
    const runtimeManifest = buildLoadedRuntimeManifest();
    const mock = createSharedPostgresMock({
      root,
      issueIdentifier: "COL-514",
      runtimeManifest
    });
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      sharedPostgres: buildSharedPostgresConfig(),
      commandRunner: mock.runner
    });
    const workspace = await backend.prepareWorkspace({
      context: { issueId: "issue-514", issueIdentifier: "COL-514" },
      runId: "run-514",
      config: buildWorkspaceTestConfig({ workspace: { root } }).workspace,
      hooks: buildWorkspaceTestConfig().hooks,
      env: { OPENAI_API_KEY: "test-openai-key" }
    });

    const cleanup = await backend.cleanupWorkspace({
      issueIdentifier: "COL-514",
      workspace,
      config: buildWorkspaceTestConfig({ workspace: { root } }).workspace,
      hooks: buildWorkspaceTestConfig().hooks,
      mode: "preserve"
    });

    expect(cleanup.serviceCleanup[0]?.removalDisposition).toBe("preserved");
    expect(cleanup.containerRemovalDisposition).toBe("stopped");
    expect(mock.calls.some((call) => call[0] === "stop" && call[1] === "symphony-shared-postgres")).toBe(false);
  });

  it("cleans up safely when the derived shared database is already missing", async () => {
    const root = await createWorkspaceRoot();
    const runtimeManifest = buildLoadedRuntimeManifest();
    const mock = createSharedPostgresMock({
      root,
      issueIdentifier: "COL-515",
      runtimeManifest
    });
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      sharedPostgres: buildSharedPostgresConfig(),
      commandRunner: mock.runner
    });
    const workspace = await backend.prepareWorkspace({
      context: { issueId: "issue-515", issueIdentifier: "COL-515" },
      runId: "run-515",
      config: buildWorkspaceTestConfig({ workspace: { root } }).workspace,
      hooks: buildWorkspaceTestConfig().hooks,
      env: { OPENAI_API_KEY: "test-openai-key" }
    });
    mock.databaseExists = false;

    const cleanup = await backend.cleanupWorkspace({
      issueIdentifier: "COL-515",
      workspace,
      config: buildWorkspaceTestConfig({ workspace: { root } }).workspace,
      hooks: buildWorkspaceTestConfig().hooks
    });

    expect(cleanup.serviceCleanup[0]?.removalDisposition).toBe("missing");
  });


  it("preinstalls workspace dependencies before bootstrap when bootstrap does not install them explicitly", async () => {
    const root = await createWorkspaceRoot();
    const config = buildWorkspaceTestConfig({
      workspace: {
        root
      }
    });
    const runtimeManifest = buildLoadedRuntimeManifest({
      init: [],
      lifecycle: {
        bootstrap: [
          {
            name: "bootstrap",
            run: "pnpm bootstrap"
          }
        ],
        migrate: [
          {
            name: "migrate",
            run: "pnpm db:migrate"
          }
        ],
        verify: [
          {
            name: "verify",
            run: "pnpm test:smoke"
          }
        ]
      }
    });
    const calls: string[][] = [];
    const lifecycleEvents: string[] = [];
    let networkInspectCount = 0;
    let serviceInspectCount = 0;
    let workspaceInspectCount = 0;
    let networkName = "unknown-network";
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      sharedPostgres: buildSharedPostgresConfig(),
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (input.args[0] === "network" && input.args[1] === "inspect") {
          networkInspectCount += 1;
          networkName = input.args[2] ?? networkName;

          return networkInspectCount === 1
            ? {
                exitCode: 1,
                stdout: "[]\n",
                stderr: `Error response from daemon: No such network: ${networkName}`
              }
            : {
                exitCode: 0,
                stdout: buildDockerNetworkInspectPayload({
                  id: "network-501b",
                  name: networkName,
                  issueIdentifier: "COL-501B",
                  workspaceKey: "COL-501B"
                }),
                stderr: ""
              };
        }

        if (input.args[0] === "network" && input.args[1] === "create") {
          networkName = input.args.at(-1) ?? networkName;
          return {
            exitCode: 0,
            stdout: "network-501b\n",
            stderr: ""
          };
        }

        if (input.args[0] === "inspect") {
          const name = input.args[3] ?? "";

          if (name.startsWith("symphony-service-postgres-")) {
            serviceInspectCount += 1;

            return serviceInspectCount === 1
              ? {
                  exitCode: 1,
                  stdout: "[]\n",
                  stderr: `Error response from daemon: No such container: ${name}`
                }
              : {
                  exitCode: 0,
                  stdout: buildDockerServiceInspectPayload({
                    id: "postgres-501b",
                    name,
                    image: "postgres:16",
                    issueIdentifier: "COL-501B",
                    workspaceKey: "COL-501B",
                    serviceKey: "postgres",
                    hostname: "db",
                    port: 5433,
                    memoryMb: 512,
                    cpuShares: 512,
                    database: "app",
                    username: "app",
                    password: "secret",
                    networkName
                  }),
                  stderr: ""
                };
          }

          workspaceInspectCount += 1;
          return workspaceInspectCount === 1
            ? {
                exitCode: 1,
                stdout: "[]\n",
                stderr: `Error response from daemon: No such container: ${name}`
              }
            : {
                exitCode: 0,
                stdout: buildDockerInspectPayload({
                  id: "workspace-501b",
                  image: "ghcr.io/openai/symphony-workspace:latest",
                  name,
                  issueIdentifier: "COL-501B",
                  workspaceKey: "COL-501B",
                  hostPath: path.join(root, "symphony-COL-501B"),
                  workspacePath: "/home/agent/workspace",
                  running: true,
                  networks: {
                    [networkName]: {
                      aliases: []
                    }
                  }
                }),
                stderr: ""
              };
        }

        if (input.args[0] === "run") {
          return {
            exitCode: 0,
            stdout: input.args.includes("postgres:16")
              ? "postgres-501b\n"
              : "workspace-501b\n",
            stderr: ""
          };
        }

        if (input.args[0] === "exec") {
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    await backend.prepareWorkspace({
      context: {
        issueId: "issue-501b",
        issueIdentifier: "COL-501B"
      },
      runId: "run-501b",
      config: config.workspace,
      hooks: config.hooks,
      env: {
        OPENAI_API_KEY: "test-openai-key"
      },
      lifecycleRecorder(event) {
        lifecycleEvents.push(event.eventType);
      }
    });

    expect(
      calls
        .filter((call) => call[0] === "exec" && call.includes("--workdir"))
        .map((call) => call.at(-1))
    ).toHaveLength(4);
    expect(
      calls
        .filter((call) => call[0] === "exec" && call.includes("--workdir"))
        .map((call) => call.at(-1))
        .at(0)
    ).toContain("corepack enable && pnpm install --frozen-lockfile");
    expect(
      calls
        .filter((call) => call[0] === "exec" && call.includes("--workdir"))
        .slice(1)
        .map((call) => call.at(-1))
    ).toEqual(["pnpm bootstrap", "pnpm db:migrate", "pnpm test:smoke"]);
    expect(lifecycleEvents).toContain("workspace_dependency_install_started");
    expect(lifecycleEvents).toContain("workspace_dependency_install_completed");
  });


  it("fails fast on migrate step failures", async () => {
    const root = await createWorkspaceRoot();
    const config = buildWorkspaceTestConfig({
      workspace: {
        root
      }
    });
    const runtimeManifest = buildLoadedRuntimeManifest({
      init: [],
      lifecycle: {
        bootstrap: [
          {
            name: "install",
            run: "pnpm install --frozen-lockfile"
          }
        ],
        migrate: [
          {
            name: "migrate",
            run: "pnpm db:migrate"
          }
        ],
        verify: [
          {
            name: "verify",
            run: "pnpm test:smoke"
          }
        ]
      }
    });
    const calls: string[][] = [];
    let networkInspectCount = 0;
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      sharedPostgres: buildSharedPostgresConfig(),
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (input.args[0] === "network" && input.args[1] === "inspect") {
          networkInspectCount += 1;
          return networkInspectCount === 1
            ? {
                exitCode: 1,
                stdout: "[]\n",
                stderr: `Error response from daemon: No such network: ${input.args[2]}`
              }
            : {
                exitCode: 0,
                stdout: buildDockerNetworkInspectPayload({
                  id: "network-504",
                  name: input.args[2] ?? "unknown",
                  issueIdentifier: "COL-504",
                  workspaceKey: "COL-504"
                }),
                stderr: ""
              };
        }

        if (input.args[0] === "network" && input.args[1] === "create") {
          return {
            exitCode: 0,
            stdout: "network-504\n",
            stderr: ""
          };
        }

        if (input.args[0] === "inspect") {
          return {
            exitCode: 1,
            stdout: "[]\n",
            stderr: `Error response from daemon: No such container: ${input.args[3]}`
          };
        }

        if (input.args[0] === "run") {
          return {
            exitCode: 0,
            stdout: input.args.includes("postgres:16")
              ? "postgres-504\n"
              : "workspace-504\n",
            stderr: ""
          };
        }

        if (input.args[0] === "exec" && input.args.at(-1)?.includes("pg_isready")) {
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        if (input.args[0] === "exec" && input.args.at(-1) === "pnpm db:migrate") {
          return {
            exitCode: 23,
            stdout: "migration failed",
            stderr: ""
          };
        }

        if (input.args[0] === "exec") {
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    await expect(
      backend.prepareWorkspace({
        context: {
          issueId: "issue-504",
          issueIdentifier: "COL-504"
        },
        runId: "run-504",
        config: config.workspace,
        hooks: config.hooks,
        env: {
          OPENAI_API_KEY: "test-openai-key"
        }
      })
    ).rejects.toThrowError(/migrate\/migrate failed/i);

    expect(
      calls
        .filter((call) => call[0] === "exec" && call.includes("--workdir"))
        .map((call) => call.at(-1))
    ).toEqual(["pnpm install --frozen-lockfile", "pnpm db:migrate"]);
  });

  it("fails fast on verify step failures", async () => {
    const root = await createWorkspaceRoot();
    const config = buildWorkspaceTestConfig({
      workspace: {
        root
      }
    });
    const runtimeManifest = buildLoadedRuntimeManifest({
      init: [],
      lifecycle: {
        bootstrap: [
          {
            name: "install",
            run: "pnpm install --frozen-lockfile"
          }
        ],
        migrate: [
          {
            name: "migrate",
            run: "pnpm db:migrate"
          }
        ],
        verify: [
          {
            name: "verify",
            run: "pnpm test:smoke"
          }
        ]
      }
    });
    const calls: string[][] = [];
    let networkInspectCount = 0;
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      sharedPostgres: buildSharedPostgresConfig(),
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (input.args[0] === "network" && input.args[1] === "inspect") {
          networkInspectCount += 1;
          return networkInspectCount === 1
            ? {
                exitCode: 1,
                stdout: "[]\n",
                stderr: `Error response from daemon: No such network: ${input.args[2]}`
              }
            : {
                exitCode: 0,
                stdout: buildDockerNetworkInspectPayload({
                  id: "network-505",
                  name: input.args[2] ?? "unknown",
                  issueIdentifier: "COL-505",
                  workspaceKey: "COL-505"
                }),
                stderr: ""
              };
        }

        if (input.args[0] === "network" && input.args[1] === "create") {
          return {
            exitCode: 0,
            stdout: "network-505\n",
            stderr: ""
          };
        }

        if (input.args[0] === "inspect") {
          return {
            exitCode: 1,
            stdout: "[]\n",
            stderr: `Error response from daemon: No such container: ${input.args[3]}`
          };
        }

        if (input.args[0] === "run") {
          return {
            exitCode: 0,
            stdout: input.args.includes("postgres:16")
              ? "postgres-505\n"
              : "workspace-505\n",
            stderr: ""
          };
        }

        if (input.args[0] === "exec" && input.args.at(-1)?.includes("pg_isready")) {
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        if (input.args[0] === "exec" && input.args.at(-1) === "pnpm test:smoke") {
          return {
            exitCode: 29,
            stdout: "verify failed",
            stderr: ""
          };
        }

        if (input.args[0] === "exec") {
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    await expect(
      backend.prepareWorkspace({
        context: {
          issueId: "issue-505",
          issueIdentifier: "COL-505"
        },
        runId: "run-505",
        config: config.workspace,
        hooks: config.hooks,
        env: {
          OPENAI_API_KEY: "test-openai-key"
        }
      })
    ).rejects.toThrowError(/verify\/verify failed/i);

    expect(
      calls
        .filter((call) => call[0] === "exec" && call.includes("--workdir"))
        .map((call) => call.at(-1))
    ).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm db:migrate",
      "pnpm test:smoke"
    ]);
  });


  it("fails closed when a postgres init step fails", async () => {
    const root = await createWorkspaceRoot();
    const config = buildWorkspaceTestConfig({
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
    const runtimeManifest = buildLoadedRuntimeManifest({
      init: [
        {
          name: "extensions",
          run: "psql \"$DATABASE_URL\" -c 'create extension if not exists pgcrypto'",
          timeoutMs: 15_000
        }
      ]
    });
    const calls: string[][] = [];
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      sharedPostgres: buildSharedPostgresConfig(),
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (input.args[0] === "network" && input.args[1] === "inspect") {
          return {
            exitCode: 1,
            stdout: "[]\n",
            stderr: `Error response from daemon: No such network: ${input.args[2]}`
          };
        }

        if (input.args[0] === "network" && input.args[1] === "create") {
          return {
            exitCode: 0,
            stdout: "network-304\n",
            stderr: ""
          };
        }

        if (input.args[0] === "inspect") {
          return {
            exitCode: 1,
            stdout: "[]\n",
            stderr: `Error response from daemon: No such container: ${input.args[3]}`
          };
        }

        if (input.args[0] === "run") {
          return {
            exitCode: 0,
            stdout: input.args.includes("postgres:16")
              ? "postgres-304\n"
              : "workspace-304\n",
            stderr: ""
          };
        }

        if (
          input.args[0] === "exec" &&
          input.args.at(-1)?.includes("create extension if not exists pgcrypto")
        ) {
          return {
            exitCode: 9,
            stdout: "init failed\n",
            stderr: "psql: could not connect"
          };
        }

        if (input.args[0] === "exec") {
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    await expect(
      backend.prepareWorkspace({
        context: {
          issueId: "issue-304",
          issueIdentifier: "COL-304"
        },
        config: config.workspace,
        hooks: config.hooks,
        env: {
          OPENAI_API_KEY: "test-openai-key"
        }
      })
    ).rejects.toThrowError(
      /Postgres init step extensions failed for service postgres/i
    );

    expect(
      calls.some((call) => call[0] === "exec" && call.at(-1) === "echo bootstrapped")
    ).toBe(false);
  });

});

function buildPreparedDockerWorkspace(input: {
  issueIdentifier: string;
  workspaceKey: string;
  containerId: string;
  containerName: string;
  hostPath: string | null;
  materializationKind?: "bind_mount" | "volume";
  volumeName?: string;
  networkDisposition?: "created" | "reused" | "not_applicable";
  networkName?: string | null;
  services?: Array<{
    key: string;
    type: "postgres";
    hostname: string;
    port: number;
    containerId: string | null;
    containerName: string;
    disposition: "created" | "reused" | "recreated";
  }>;
  envBundle?: ReturnType<typeof ambientEnvBundle>;
}) {
  const materializationKind = input.materializationKind ?? "bind_mount";

  return {
    issueIdentifier: input.issueIdentifier,
    workspaceKey: input.workspaceKey,
    backendKind: "docker" as const,
    prepareDisposition: "reused" as const,
    containerDisposition: "reused" as const,
    networkDisposition: input.networkDisposition ?? ("not_applicable" as const),
    afterCreateHookOutcome: "skipped" as const,
    executionTarget: {
      kind: "container" as const,
      workspacePath: "/home/agent/workspace",
      containerId: input.containerId,
      containerName: input.containerName,
      hostPath: input.hostPath,
      shell: "sh"
    },
    materialization:
      materializationKind === "volume"
        ? {
            kind: "volume" as const,
            volumeName: input.volumeName ?? "workspace-volume",
            containerPath: "/home/agent/workspace",
            hostPath: null
          }
        : {
            kind: "bind_mount" as const,
            hostPath: input.hostPath ?? "/tmp/workspace",
            containerPath: "/home/agent/workspace"
          },
    networkName: input.networkName ?? null,
    services: input.services ?? [],
    envBundle: input.envBundle ?? ambientEnvBundle(),
    manifestLifecycle: null,
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
  hostPath: string | null;
  volumeName?: string;
  workspacePath: string;
  running: boolean;
  status?: string;
  materializationKind?: "bind_mount" | "volume";
  labels?: Record<string, string>;
  env?: Record<string, string>;
  networks?: Record<string, { aliases: string[] }>;
}): string {
  const materializationKind = input.materializationKind ?? "bind_mount";

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
        Env: Object.entries(input.env ?? {}).map(([key, value]) => `${key}=${value}`),
        Labels:
          input.labels ?? {
            "dev.symphony.workspace-backend": "docker",
            "dev.symphony.workspace-key": input.workspaceKey,
            "dev.symphony.issue-identifier": input.issueIdentifier,
            "dev.symphony.materialization": materializationKind,
            "dev.symphony.managed-kind": "workspace_container"
          }
      },
      NetworkSettings: {
        Networks: Object.fromEntries(
          Object.entries(input.networks ?? {}).map(([name, network]) => [
            name,
            {
              Aliases: network.aliases
            }
          ])
        )
      },
      Mounts:
        materializationKind === "volume"
          ? [
              {
                Type: "volume",
                Source: null,
                Destination: input.workspacePath,
                Name: input.volumeName ?? null
              }
            ]
          : [
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

function buildDockerServiceInspectPayload(input: {
  id: string;
  name: string;
  image: string;
  issueIdentifier: string;
  workspaceKey: string;
  serviceKey: string;
  hostname: string;
  port: number;
  memoryMb?: number;
  cpuShares?: number;
  database: string;
  username: string;
  password: string;
  networkName: string;
}): string {
  return JSON.stringify([
    {
      Id: input.id,
      Name: `/${input.name}`,
      State: {
        Running: true,
        Status: "running"
      },
      Config: {
        Image: input.image,
        Env: [
          `POSTGRES_DB=${input.database}`,
          `POSTGRES_USER=${input.username}`,
          `POSTGRES_PASSWORD=${input.password}`
        ],
        Labels: {
          "dev.symphony.workspace-backend": "docker",
          "dev.symphony.workspace-key": input.workspaceKey,
          "dev.symphony.issue-identifier": input.issueIdentifier,
          "dev.symphony.managed-kind": "workspace_service",
          "dev.symphony.service-key": input.serviceKey,
          "dev.symphony.service-type": "postgres",
          "dev.symphony.service-hostname": input.hostname,
          "dev.symphony.service-port": String(input.port),
          ...(input.memoryMb === undefined
            ? {}
            : { "dev.symphony.service-memory-mb": String(input.memoryMb) }),
          ...(input.cpuShares === undefined
            ? {}
            : { "dev.symphony.service-cpu-shares": String(input.cpuShares) }),
          "dev.symphony.network-name": input.networkName
        }
      },
      NetworkSettings: {
        Networks: {
          [input.networkName]: {
            Aliases: [input.hostname]
          }
        }
      },
      Mounts: []
    }
  ]);
}

function buildDockerSharedServiceInspectPayload(input: {
  id: string;
  name: string;
  image: string;
  adminDatabase: string;
  adminUsername: string;
  adminPassword: string;
  containerPort: number;
}): string {
  return JSON.stringify([
    {
      Id: input.id,
      Name: `/${input.name}`,
      State: {
        Running: true,
        Status: "running"
      },
      Config: {
        Image: input.image,
        Env: [
          `POSTGRES_DB=${input.adminDatabase}`,
          `POSTGRES_USER=${input.adminUsername}`,
          `POSTGRES_PASSWORD=${input.adminPassword}`
        ],
        Labels: {
          "dev.symphony.workspace-backend": "docker",
          "dev.symphony.managed-kind": "shared_service",
          "dev.symphony.service-type": "postgres",
          "dev.symphony.service-port": String(input.containerPort)
        }
      },
      NetworkSettings: {
        Networks: {}
      },
      Mounts: []
    }
  ]);
}

function buildDockerNetworkInspectPayload(input: {
  id: string;
  name: string;
  issueIdentifier: string;
  workspaceKey: string;
}): string {
  return JSON.stringify([
    {
      Id: input.id,
      Name: input.name,
      Labels: {
        "dev.symphony.workspace-backend": "docker",
        "dev.symphony.workspace-key": input.workspaceKey,
        "dev.symphony.issue-identifier": input.issueIdentifier,
        "dev.symphony.managed-kind": "workspace_network"
      }
    }
  ]);
}

function buildDockerVolumeInspectPayload(input: {
  name: string;
  issueIdentifier: string;
  workspaceKey: string;
  materializationKind: "bind_mount" | "volume";
}): string {
  return JSON.stringify([
    {
      Name: input.name,
      Labels: {
        "dev.symphony.workspace-backend": "docker",
        "dev.symphony.workspace-key": input.workspaceKey,
        "dev.symphony.issue-identifier": input.issueIdentifier,
        "dev.symphony.materialization": input.materializationKind,
        "dev.symphony.managed-kind": "workspace_volume"
      }
    }
  ]);
}

function buildLoadedRuntimeManifest(input?: {
  resources?: {
    memoryMb?: number;
    cpuShares?: number;
  };
  readiness?: {
    timeoutMs?: number;
    intervalMs?: number;
    retries?: number;
  };
  init?: SymphonyRuntimeStep[];
  lifecycle?: {
    bootstrap?: SymphonyRuntimeStep[];
    migrate?: SymphonyRuntimeStep[];
    verify?: [SymphonyRuntimeStep, ...SymphonyRuntimeStep[]];
    seed?: SymphonyRuntimeStep[];
    cleanup?: SymphonyRuntimeStep[];
  };
}): SymphonyLoadedRuntimeManifest {
  return {
    repoRoot: "/repo",
    manifestPath: "/repo/.symphony/runtime.ts",
    manifest: normalizeSymphonyRuntimeManifest({
      schemaVersion: 1,
      workspace: {
        packageManager: "pnpm"
      },
      services: {
        postgres: {
          type: "postgres",
          image: "postgres:16",
          hostname: "db",
          port: 5433,
          database: "app",
          username: "app",
          password: "secret",
          ...(input?.resources ? { resources: input.resources } : {}),
          ...(input?.readiness ? { readiness: input.readiness } : {}),
          ...(input?.init ? { init: input.init } : {})
        }
      },
      env: {
        host: {
          required: ["OPENAI_API_KEY"],
          optional: ["GITHUB_TOKEN"]
        },
        inject: {
          APP_ENV: {
            kind: "static",
            value: "dev"
          },
          DATABASE_URL: {
            kind: "service",
            service: "postgres",
            value: "connectionString"
          },
          PGHOST: {
            kind: "service",
            service: "postgres",
            value: "host"
          },
          PGPORT: {
            kind: "service",
            service: "postgres",
            value: "port"
          },
          SYMPHONY_WORKSPACE_KEY: {
            kind: "runtime",
            value: "workspaceKey"
          }
        }
      },
      lifecycle: {
        bootstrap: input?.lifecycle?.bootstrap ?? [],
        migrate: input?.lifecycle?.migrate ?? [],
        verify: input?.lifecycle?.verify ?? [
          {
            name: "verify",
            run: "pnpm test"
          }
        ],
        seed: input?.lifecycle?.seed ?? [],
        cleanup: input?.lifecycle?.cleanup ?? []
      }
    })
  };
}

function buildSharedPostgresConfig() {
  return {
    containerName: "symphony-shared-postgres",
    image: "postgres:16",
    host: "host.docker.internal",
    hostPort: 55_432,
    containerPort: 5_432,
    adminDatabase: "postgres",
    adminUsername: "postgres",
    adminPassword: "postgres",
    databasePrefix: "symphony",
    rolePrefix: "symphony"
  };
}

function createSharedPostgresMock(input: {
  root: string;
  issueIdentifier: string;
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  readinessFailures?: number;
  commandFailures?: Record<
    string,
    {
      exitCode: number;
      stdout: string;
      stderr: string;
    }
  >;
}) {
  const shared = buildSharedPostgresConfig();
  const workspaceKey = input.issueIdentifier;
  let sharedExists = false;
  let workspaceExists = false;
  let readinessFailuresRemaining = input.readinessFailures ?? 0;
  const calls: string[][] = [];
  const state = {
    databaseExists: false
  };

  return {
    calls,
    get databaseExists() {
      return state.databaseExists;
    },
    set databaseExists(value: boolean) {
      state.databaseExists = value;
    },
    lifecycleCommands() {
      return calls
        .filter((call) => call[0] === "exec" && call.includes("--workdir"))
        .map((call) => call.at(-1) ?? "");
    },
    runner: (async (inputCommand) => {
      const args = [...inputCommand.args];
      calls.push(args);

      if (args[0] === "inspect") {
        const name = args[3] ?? "";
        if (name === shared.containerName) {
          if (!sharedExists) {
            return {
              exitCode: 1,
              stdout: "[]\n",
              stderr: `Error response from daemon: No such container: ${name}`
            };
          }

          return {
            exitCode: 0,
            stdout: buildDockerSharedServiceInspectPayload({
              id: "shared-postgres-test",
              name,
              image: shared.image,
              adminDatabase: shared.adminDatabase,
              adminUsername: shared.adminUsername,
              adminPassword: shared.adminPassword,
              containerPort: shared.containerPort
            }),
            stderr: ""
          };
        }

        if (!workspaceExists) {
          return {
            exitCode: 1,
            stdout: "[]\n",
            stderr: `Error response from daemon: No such container: ${name}`
          };
        }

        return {
          exitCode: 0,
          stdout: buildDockerInspectPayload({
            id: "workspace-test",
            image: "ghcr.io/openai/symphony-workspace:latest",
            name,
            issueIdentifier: input.issueIdentifier,
            workspaceKey,
            hostPath: path.join(input.root, `symphony-${workspaceKey}`),
            workspacePath: "/home/agent/workspace",
            running: true
          }),
          stderr: ""
        };
      }

      if (args[0] === "run") {
        if (args.includes(shared.image)) {
          sharedExists = true;
          return { exitCode: 0, stdout: "shared-postgres-test\n", stderr: "" };
        }

        workspaceExists = true;
        return { exitCode: 0, stdout: "workspace-test\n", stderr: "" };
      }

      if (args[0] === "stop") {
        workspaceExists = false;
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      if (args[0] === "rm") {
        workspaceExists = false;
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      if (args[0] === "exec") {
        const script = args.at(-1) ?? "";
        if (script.includes("pg_isready")) {
          if (readinessFailuresRemaining > 0) {
            readinessFailuresRemaining -= 1;
            return { exitCode: 1, stdout: "pg_isready: no response\n", stderr: "connection refused" };
          }

          return { exitCode: 0, stdout: "", stderr: "" };
        }

        if (script.includes("SELECT 1 FROM pg_database")) {
          return { exitCode: 0, stdout: state.databaseExists ? "1\n" : "", stderr: "" };
        }

        if (script.includes("CREATE DATABASE")) {
          state.databaseExists = true;
          return { exitCode: 0, stdout: "", stderr: "" };
        }

        if (script.includes("DROP DATABASE")) {
          state.databaseExists = false;
          return { exitCode: 0, stdout: "", stderr: "" };
        }

        if (script.includes("DO $$")) {
          return { exitCode: 0, stdout: "", stderr: "" };
        }

        const failure = input.commandFailures?.[script];
        if (failure) {
          return failure;
        }

        return { exitCode: 0, stdout: "", stderr: "" };
      }

      throw new Error(`Unexpected docker command: ${args.join(" ")}`);
    }) satisfies DockerWorkspaceCommandRunner
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
