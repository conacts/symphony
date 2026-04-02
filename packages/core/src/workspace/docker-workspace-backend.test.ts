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
import {
  buildSymphonyRuntimePostgresConnectionString,
  normalizeSymphonyRuntimeManifest,
  resolveSymphonyRuntimeEnvBundle,
  type SymphonyLoadedRuntimeManifest,
  type SymphonyRuntimeStep
} from "../runtime-manifest.js";

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
  it("mounts explicit host auth material into the container contract", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
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
          containerPath: "/tmp/symphony-home/.codex/auth.json",
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
        "type=bind,src=/Users/test/.codex/auth.json,dst=/tmp/symphony-home/.codex/auth.json,readonly"
      ])
    );
  });

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
      envBundle: ambientEnvBundle(),
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

  it("prepares volume-backed workspaces without fabricating a host repo path", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
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
    const config = buildSymphonyWorkflowConfig({
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

    const config = buildSymphonyWorkflowConfig({
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

    const config = buildSymphonyWorkflowConfig({
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

  it("provisions and reuses a per-workspace network and postgres sidecar with explicit env injection", async () => {
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
    const runtimeManifest = buildLoadedRuntimeManifest({
      resources: {
        memoryMb: 768,
        cpuShares: 256
      },
      init: [
        {
          name: "extensions",
          run: "psql \"$DATABASE_URL\" -c 'select 1'",
          timeoutMs: 15_000
        }
      ]
    });
    const calls: string[][] = [];
    let networkInspectCount = 0;
    let serviceInspectCount = 0;
    let workspaceInspectCount = 0;
    let observedNetworkName: string | null = null;
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      shell: "bash",
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (input.args[0] === "network" && input.args[1] === "inspect") {
          observedNetworkName = input.args[2] ?? observedNetworkName;
          networkInspectCount += 1;

          if (networkInspectCount === 1) {
            return {
              exitCode: 1,
              stdout: "[]\n",
              stderr: `Error response from daemon: No such network: ${input.args[2]}`
            };
          }

          return {
            exitCode: 0,
            stdout: buildDockerNetworkInspectPayload({
              id: "network-301",
              name: input.args[2] ?? "unknown",
              issueIdentifier: "COL-301",
              workspaceKey: "COL-301"
            }),
            stderr: ""
          };
        }

        if (input.args[0] === "network" && input.args[1] === "create") {
          observedNetworkName = input.args.at(-1) ?? observedNetworkName;
          return {
            exitCode: 0,
            stdout: "network-301\n",
            stderr: ""
          };
        }

        if (input.args[0] === "inspect") {
          const name = input.args[3] ?? "";

          if (name.startsWith("symphony-service-postgres-")) {
            serviceInspectCount += 1;

            if (serviceInspectCount === 1) {
              return {
                exitCode: 1,
                stdout: "[]\n",
                stderr: `Error response from daemon: No such container: ${name}`
              };
            }

            return {
              exitCode: 0,
              stdout: buildDockerServiceInspectPayload({
                id: "postgres-301",
                name,
                image: "postgres:16",
                issueIdentifier: "COL-301",
                workspaceKey: "COL-301",
                serviceKey: "postgres",
                hostname: "db",
                port: 5433,
                memoryMb: 768,
                cpuShares: 256,
                database: "app",
                username: "app",
                password: "secret",
                networkName: observedNetworkName ?? "unknown"
              }),
              stderr: ""
            };
          }

          workspaceInspectCount += 1;
          if (workspaceInspectCount === 1) {
            return {
              exitCode: 1,
              stdout: "[]\n",
              stderr: `Error response from daemon: No such container: ${name}`
            };
          }

          return {
            exitCode: 0,
            stdout: buildDockerInspectPayload({
              id: "workspace-301",
              image: "ghcr.io/openai/symphony-workspace:latest",
              name,
              issueIdentifier: "COL-301",
              workspaceKey: "COL-301",
              hostPath: path.join(root, "symphony-COL-301"),
              workspacePath: "/home/agent/workspace",
              running: true,
              networks:
                observedNetworkName === null
                  ? {}
                  : {
                      [observedNetworkName]: {
                        aliases: []
                      }
                    }
            }),
            stderr: ""
          };
        }

        if (input.args[0] === "run") {
          const networkIndex = input.args.indexOf("--network");
          if (networkIndex !== -1) {
            observedNetworkName =
              input.args[networkIndex + 1] ?? observedNetworkName;
          }

          if (input.args.includes("postgres:16")) {
            return {
              exitCode: 0,
              stdout: "postgres-301\n",
              stderr: ""
            };
          }

          return {
            exitCode: 0,
            stdout: "workspace-301\n",
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

    const first = await backend.prepareWorkspace({
      context: {
        issueId: "issue-301",
        issueIdentifier: "COL-301"
      },
      runId: "run-301",
      config: config.workspace,
      hooks: config.hooks,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        GITHUB_TOKEN: "test-github-token"
      }
    });
    const second = await backend.prepareWorkspace({
      context: {
        issueId: "issue-301",
        issueIdentifier: "COL-301"
      },
      runId: "run-302",
      config: config.workspace,
      hooks: config.hooks,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        GITHUB_TOKEN: "test-github-token"
      }
    });

    const postgresRunCall = calls.find(
      (call) => call[0] === "run" && call.includes("postgres:16")
    );
    const workspaceRunCall = calls.find(
      (call) =>
        call[0] === "run" &&
        call.includes("ghcr.io/openai/symphony-workspace:latest")
    );
    const initCall = calls.find(
      (call) =>
        call[0] === "exec" &&
        call.at(-1) === "psql \"$DATABASE_URL\" -c 'select 1'"
    );
    const afterCreateCall = calls.find(
      (call) => call[0] === "exec" && call.at(-1) === "echo bootstrapped"
    );

    expect(first.networkDisposition).toBe("created");
    expect(first.networkName).toMatch(
      /^symphony-workspace-network-col-301-[0-9a-f]{8}$/
    );
    expect(first.services).toEqual([
      {
        key: "postgres",
        type: "postgres",
        hostname: "db",
        port: 5433,
        containerId: "postgres-301",
        containerName: expect.stringMatching(
          /^symphony-service-postgres-col-301-[0-9a-f]{8}$/
        ),
        disposition: "created"
      }
    ]);
    expect(first.envBundle.source).toBe("manifest");
    expect(first.envBundle.values).toMatchObject({
      OPENAI_API_KEY: "test-openai-key",
      GITHUB_TOKEN: "test-github-token",
      APP_ENV: "dev",
      DATABASE_URL: "postgresql://app:secret@db:5433/app",
      PGHOST: "db",
      PGPORT: "5433",
      SYMPHONY_WORKSPACE_KEY: "COL-301"
    });
    expect(second.networkDisposition).toBe("reused");
    expect(second.containerDisposition).toBe("reused");
    expect(second.services[0]?.disposition).toBe("reused");

    expect(postgresRunCall).toEqual(
      expect.arrayContaining([
        "run",
        "-d",
        "--network",
        first.networkName ?? "",
        "--network-alias",
        "db",
        "--memory",
        "768m",
        "--cpu-shares",
        "256",
        "postgres:16",
        "postgres",
        "-p",
        "5433"
      ])
    );
    expect(postgresRunCall).not.toContain("--publish");
    expect(workspaceRunCall).toEqual(
      expect.arrayContaining([
        "run",
        "-d",
        "--network",
        first.networkName ?? "",
        "--entrypoint",
        "bash",
        "ghcr.io/openai/symphony-workspace:latest"
      ])
    );
    expect(initCall?.join(" ")).toContain(
      "DATABASE_URL=postgresql://app:secret@db:5433/app"
    );
    expect(initCall?.join(" ")).toContain("PGHOST=db");
    expect(initCall?.join(" ")).toContain("OPENAI_API_KEY=test-openai-key");
    expect(afterCreateCall?.join(" ")).toContain(
      "DATABASE_URL=postgresql://app:secret@db:5433/app"
    );
    expect(afterCreateCall?.join(" ")).toContain("SYMPHONY_WORKSPACE_KEY=COL-301");
    expect(calls.filter((call) => call.at(-1) === "echo bootstrapped")).toHaveLength(1);
    expect(calls.filter((call) => call.at(-1)?.includes("pg_isready"))).toHaveLength(2);
  });

  it("executes ordered manifest lifecycle phases with explicit env injection and skips them on warm reuse", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      },
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1_000
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
        seed: [
          {
            name: "seed",
            run: "pnpm db:seed"
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
    const lifecycleEvents: Array<{
      eventType: string;
      payload: unknown;
    }> = [];
    let networkInspectCount = 0;
    let serviceInspectCount = 0;
    let workspaceInspectCount = 0;
    let networkName = "unknown-network";
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
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
                  id: "network-501",
                  name: networkName,
                  issueIdentifier: "COL-501",
                  workspaceKey: "COL-501"
                }),
                stderr: ""
              };
        }

        if (input.args[0] === "network" && input.args[1] === "create") {
          networkName = input.args.at(-1) ?? networkName;
          return {
            exitCode: 0,
            stdout: "network-501\n",
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
                    id: "postgres-501",
                    name,
                    image: "postgres:16",
                    issueIdentifier: "COL-501",
                    workspaceKey: "COL-501",
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
                  id: "workspace-501",
                  image: "ghcr.io/openai/symphony-workspace:latest",
                  name,
                  issueIdentifier: "COL-501",
                  workspaceKey: "COL-501",
                  hostPath: path.join(root, "symphony-COL-501"),
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
              ? "postgres-501\n"
              : "workspace-501\n",
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

    const first = await backend.prepareWorkspace({
      context: {
        issueId: "issue-501",
        issueIdentifier: "COL-501"
      },
      runId: "run-501",
      config: config.workspace,
      hooks: config.hooks,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        GITHUB_TOKEN: "test-github-token"
      },
      lifecycleRecorder(event) {
        lifecycleEvents.push({
          eventType: event.eventType,
          payload: event.payload
        });
      }
    });
    const second = await backend.prepareWorkspace({
      context: {
        issueId: "issue-501",
        issueIdentifier: "COL-501"
      },
      runId: "run-502",
      config: config.workspace,
      hooks: config.hooks,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        GITHUB_TOKEN: "test-github-token"
      },
      lifecycleRecorder(event) {
        lifecycleEvents.push({
          eventType: event.eventType,
          payload: event.payload
        });
      }
    });

    const lifecycleExecCommands = calls
      .filter((call) => call[0] === "exec" && call.includes("--workdir"))
      .map((call) => call.at(-1));

    expect(lifecycleExecCommands).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm db:migrate",
      "pnpm db:seed",
      "pnpm test:smoke"
    ]);
    expect(
      calls
        .find((call) => call.at(-1) === "pnpm install --frozen-lockfile")
        ?.join(" ")
    ).toContain("OPENAI_API_KEY=test-openai-key");
    expect(
      calls.find((call) => call.at(-1) === "pnpm db:migrate")?.join(" ")
    ).toContain("DATABASE_URL=postgresql://app:secret@db:5433/app");
    expect(first.manifestLifecycle?.phases).toMatchObject([
      { phase: "bootstrap", status: "completed", trigger: "workspace_lifetime" },
      { phase: "migrate", status: "completed", trigger: "service_lifetime" },
      { phase: "seed", status: "completed", trigger: "service_lifetime" },
      { phase: "verify", status: "completed", trigger: "readiness_lifetime" }
    ]);
    expect(second.manifestLifecycle?.phases).toMatchObject([
      {
        phase: "bootstrap",
        status: "skipped",
        skipReason: "already_completed_for_current_lifetime"
      },
      {
        phase: "migrate",
        status: "skipped",
        skipReason: "already_completed_for_current_lifetime"
      },
      {
        phase: "seed",
        status: "skipped",
        skipReason: "already_completed_for_current_lifetime"
      },
      {
        phase: "verify",
        status: "skipped",
        skipReason: "already_completed_for_current_lifetime"
      }
    ]);
    expect(lifecycleEvents.map((event) => event.eventType)).toEqual([
      "workspace_manifest_phase_started",
      "workspace_manifest_step_started",
      "workspace_manifest_step_completed",
      "workspace_manifest_phase_completed",
      "workspace_manifest_phase_started",
      "workspace_manifest_step_started",
      "workspace_manifest_step_completed",
      "workspace_manifest_phase_completed",
      "workspace_manifest_phase_started",
      "workspace_manifest_step_started",
      "workspace_manifest_step_completed",
      "workspace_manifest_phase_completed",
      "workspace_manifest_phase_started",
      "workspace_manifest_step_started",
      "workspace_manifest_step_completed",
      "workspace_manifest_phase_completed",
      "workspace_manifest_phase_skipped",
      "workspace_manifest_phase_skipped",
      "workspace_manifest_phase_skipped",
      "workspace_manifest_phase_skipped"
    ]);
    expect(JSON.stringify(lifecycleEvents)).not.toContain("test-openai-key");
    expect(JSON.stringify(lifecycleEvents)).not.toContain("test-github-token");
  });

  it("reruns service-dependent phases when the service side is recreated", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
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
        seed: [
          {
            name: "seed",
            run: "pnpm db:seed"
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
    let serviceInspectCount = 0;
    let workspaceInspectCount = 0;
    let serviceRunCount = 0;
    let networkName = "unknown-network";
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
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
                  id: "network-502",
                  name: networkName,
                  issueIdentifier: "COL-502",
                  workspaceKey: "COL-502"
                }),
                stderr: ""
              };
        }

        if (input.args[0] === "network" && input.args[1] === "create") {
          networkName = input.args.at(-1) ?? networkName;
          return {
            exitCode: 0,
            stdout: "network-502\n",
            stderr: ""
          };
        }

        if (input.args[0] === "inspect") {
          const name = input.args[3] ?? "";

          if (name.startsWith("symphony-service-postgres-")) {
            serviceInspectCount += 1;

            if (serviceInspectCount === 1) {
              return {
                exitCode: 1,
                stdout: "[]\n",
                stderr: `Error response from daemon: No such container: ${name}`
              };
            }

            return {
              exitCode: 0,
              stdout: buildDockerServiceInspectPayload({
                id: serviceInspectCount === 2 ? "postgres-502-stale" : "postgres-502",
                name,
                image: "postgres:16",
                issueIdentifier: "COL-502",
                workspaceKey: "COL-502",
                serviceKey: "postgres",
                hostname: "db",
                port: 5433,
                memoryMb: 512,
                cpuShares: serviceInspectCount === 2 ? 999 : 512,
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
                  id: "workspace-502",
                  image: "ghcr.io/openai/symphony-workspace:latest",
                  name,
                  issueIdentifier: "COL-502",
                  workspaceKey: "COL-502",
                  hostPath: path.join(root, "symphony-COL-502"),
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
          if (input.args.includes("postgres:16")) {
            serviceRunCount += 1;
            return {
              exitCode: 0,
              stdout: serviceRunCount === 1 ? "postgres-502\n" : "postgres-502b\n",
              stderr: ""
            };
          }

          return {
            exitCode: 0,
            stdout: "workspace-502\n",
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

    const first = await backend.prepareWorkspace({
      context: {
        issueId: "issue-502",
        issueIdentifier: "COL-502"
      },
      runId: "run-502a",
      config: config.workspace,
      hooks: config.hooks,
      env: {
        OPENAI_API_KEY: "test-openai-key"
      }
    });
    const second = await backend.prepareWorkspace({
      context: {
        issueId: "issue-502",
        issueIdentifier: "COL-502"
      },
      runId: "run-502b",
      config: config.workspace,
      hooks: config.hooks,
      env: {
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    expect(first.services[0]?.disposition).toBe("created");
    expect(second.services[0]?.disposition).toBe("recreated");
    expect(second.manifestLifecycle?.phases).toMatchObject([
      {
        phase: "bootstrap",
        status: "skipped",
        skipReason: "already_completed_for_current_lifetime"
      },
      { phase: "migrate", status: "completed" },
      { phase: "seed", status: "completed" },
      { phase: "verify", status: "completed" }
    ]);
    expect(
      calls
        .filter((call) => call[0] === "exec" && call.includes("--workdir"))
        .map((call) => call.at(-1))
    ).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm db:migrate",
      "pnpm db:seed",
      "pnpm test:smoke",
      "pnpm db:migrate",
      "pnpm db:seed",
      "pnpm test:smoke"
    ]);
  });

  it("fails fast on bootstrap step failures and redacts secret values", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
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
    const lifecycleEvents: string[] = [];
    let networkInspectCount = 0;
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
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
                  id: "network-503",
                  name: input.args[2] ?? "unknown",
                  issueIdentifier: "COL-503",
                  workspaceKey: "COL-503"
                }),
                stderr: ""
              };
        }

        if (input.args[0] === "network" && input.args[1] === "create") {
          return {
            exitCode: 0,
            stdout: "network-503\n",
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
              ? "postgres-503\n"
              : "workspace-503\n",
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

        if (input.args[0] === "exec") {
          return {
            exitCode: 17,
            stdout: "OPENAI_API_KEY=test-openai-key\n",
            stderr: "DATABASE_URL=postgresql://app:secret@db:5433/app"
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    let bootstrapFailure: unknown = null;

    try {
      await backend.prepareWorkspace({
        context: {
          issueId: "issue-503",
          issueIdentifier: "COL-503"
        },
        runId: "run-503",
        config: config.workspace,
        hooks: config.hooks,
        env: {
          OPENAI_API_KEY: "test-openai-key"
        },
        lifecycleRecorder(event) {
          lifecycleEvents.push(event.eventType);
        }
      });
    } catch (error) {
      bootstrapFailure = error;
    }

    expect(bootstrapFailure).toBeInstanceOf(Error);
    expect(String(bootstrapFailure)).toMatch(/bootstrap\/install failed/i);
    expect(String(bootstrapFailure)).not.toMatch(
      /test-openai-key|postgresql:\/\/app:secret@db:5433\/app/i
    );

    expect(lifecycleEvents).toEqual([
      "workspace_manifest_phase_started",
      "workspace_manifest_step_started",
      "workspace_manifest_step_completed",
      "workspace_manifest_phase_failed"
    ]);
    expect(
      calls
        .filter((call) => call[0] === "exec" && call.includes("--workdir"))
        .map((call) => call.at(-1))
    ).toEqual(["pnpm install --frozen-lockfile"]);
  });

  it("fails fast on migrate step failures", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
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
    const config = buildSymphonyWorkflowConfig({
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

  it("runs cleanup lifecycle phases before resource removal and does not leak secrets in surfaced metadata", async () => {
    const root = await createWorkspaceRoot();
    const workspacePath = path.join(root, "symphony-COL-506");
    await mkdir(workspacePath, {
      recursive: true
    });
    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      }
    });
    const runtimeManifest = buildLoadedRuntimeManifest({
      lifecycle: {
        cleanup: [
          {
            name: "cleanup",
            run: "pnpm cleanup"
          }
        ]
      }
    });
    const workspace = buildPreparedDockerWorkspace({
      issueIdentifier: "COL-506",
      workspaceKey: "COL-506",
      containerId: "workspace-506",
      containerName: "symphony-workspace-col-506-deadbeef",
      hostPath: workspacePath,
      networkDisposition: "reused",
      networkName: "symphony-workspace-network-col-506-deadbeef",
      services: [
        {
          key: "postgres",
          type: "postgres",
          hostname: "db",
          port: 5433,
          containerId: "postgres-506",
          containerName: "symphony-service-postgres-col-506-deadbeef",
          disposition: "reused"
        }
      ],
      envBundle: buildManifestEnvBundle({
        runtimeManifest,
        issueIdentifier: "COL-506",
        issueId: "issue-506",
        workspaceKey: "COL-506",
        workspacePath: "/home/agent/workspace"
      })
    });
    const calls: string[][] = [];
    const lifecycleEvents: string[] = [];
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (input.args[0] === "inspect") {
          if (input.args[3]?.startsWith("symphony-service-postgres-")) {
            return {
              exitCode: 0,
              stdout: buildDockerServiceInspectPayload({
                id: "postgres-506",
                name: input.args[3] ?? "unknown",
                image: "postgres:16",
                issueIdentifier: "COL-506",
                workspaceKey: "COL-506",
                serviceKey: "postgres",
                hostname: "db",
                port: 5433,
                memoryMb: 512,
                cpuShares: 512,
                database: "app",
                username: "app",
                password: "secret",
                networkName: "symphony-workspace-network-col-506-deadbeef"
              }),
              stderr: ""
            };
          }

          return {
            exitCode: 0,
            stdout: buildDockerInspectPayload({
              id: "workspace-506",
              image: "ghcr.io/openai/symphony-workspace:latest",
              name: input.args[3] ?? "unknown",
              issueIdentifier: "COL-506",
              workspaceKey: "COL-506",
              hostPath: workspacePath,
              workspacePath: "/home/agent/workspace",
              running: true
            }),
            stderr: ""
          };
        }

        if (input.args[0] === "exec") {
          return {
            exitCode: 31,
            stdout: "OPENAI_API_KEY=test-openai-key",
            stderr: "DATABASE_URL=postgresql://app:secret@db:5433/app"
          };
        }

        if (input.args[0] === "rm") {
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        if (input.args[0] === "network" && input.args[1] === "inspect") {
          return {
            exitCode: 0,
            stdout: buildDockerNetworkInspectPayload({
              id: "network-506",
              name: "symphony-workspace-network-col-506-deadbeef",
              issueIdentifier: "COL-506",
              workspaceKey: "COL-506"
            }),
            stderr: ""
          };
        }

        if (input.args[0] === "network" && input.args[1] === "rm") {
          return {
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    const cleanup = await backend.cleanupWorkspace({
      issueIdentifier: "COL-506",
      runId: "run-506",
      workspace,
      config: config.workspace,
      hooks: config.hooks,
      lifecycleRecorder(event) {
        lifecycleEvents.push(event.eventType);
      }
    });

    expect(cleanup.manifestLifecycleCleanup).toMatchObject({
      phase: "cleanup",
      status: "failed",
      trigger: "teardown"
    });
    expect(cleanup.containerRemovalDisposition).toBe("removed");
    expect(cleanup.serviceCleanup[0]?.removalDisposition).toBe("removed");
    expect(cleanup.networkRemovalDisposition).toBe("removed");
    expect(calls.map((call) => call[0])).toEqual([
      "inspect",
      "exec",
      "inspect",
      "rm",
      "inspect",
      "inspect",
      "rm",
      "network",
      "network"
    ]);
    expect(lifecycleEvents).toEqual([
      "workspace_manifest_phase_started",
      "workspace_manifest_step_started",
      "workspace_manifest_step_completed",
      "workspace_manifest_phase_failed"
    ]);
    expect(JSON.stringify(cleanup)).not.toContain("test-openai-key");
    expect(JSON.stringify(cleanup)).not.toContain("postgresql://app:secret@db:5433/app");
  });

  it("applies conservative default postgres resource limits when the manifest omits them", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      }
    });
    const runtimeManifest = buildLoadedRuntimeManifest();
    const calls: string[][] = [];
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
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
            stdout: "network-302\n",
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
              ? "postgres-302\n"
              : "workspace-302\n",
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
        issueId: "issue-302",
        issueIdentifier: "COL-302"
      },
      config: config.workspace,
      hooks: config.hooks,
      env: {
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    const postgresRunCall = calls.find(
      (call) => call[0] === "run" && call.includes("postgres:16")
    );

    expect(postgresRunCall).toEqual(
      expect.arrayContaining([
        "--memory",
        "512m",
        "--cpu-shares",
        "512"
      ])
    );
  });

  it("fails closed when postgres readiness never succeeds", async () => {
    const root = await createWorkspaceRoot();
    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      }
    });
    const runtimeManifest = buildLoadedRuntimeManifest({
      readiness: {
        timeoutMs: 250,
        intervalMs: 1,
        retries: 2
      }
    });
    const calls: string[][] = [];
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
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
            stdout: "network-303\n",
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
            stdout: "postgres-303\n",
            stderr: ""
          };
        }

        if (input.args[0] === "exec") {
          return {
            exitCode: 1,
            stdout: "pg_isready: no response\n",
            stderr: "connection refused"
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    await expect(
      backend.prepareWorkspace({
        context: {
          issueId: "issue-303",
          issueIdentifier: "COL-303"
        },
        config: config.workspace,
        hooks: config.hooks,
        env: {
          OPENAI_API_KEY: "test-openai-key"
        }
      })
    ).rejects.toThrowError(
      /Postgres service postgres failed readiness after 2 attempts/i
    );

    expect(calls.filter((call) => call[0] === "exec")).toHaveLength(2);
    expect(
      calls.some(
        (call) =>
          call[0] === "run" &&
          call.includes("ghcr.io/openai/symphony-workspace:latest")
      )
    ).toBe(false);
  });

  it("fails closed when a postgres init step fails", async () => {
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

  it("cleans up safely when sidecar containers or networks are already missing", async () => {
    const root = await createWorkspaceRoot();
    const workspacePath = path.join(root, "symphony-COL-305");
    await mkdir(workspacePath, {
      recursive: true
    });

    const config = buildSymphonyWorkflowConfig({
      workspace: {
        root
      }
    });
    const runtimeManifest = buildLoadedRuntimeManifest();
    const calls: string[][] = [];
    const workspace = buildPreparedDockerWorkspace({
      issueIdentifier: "COL-305",
      workspaceKey: "COL-305",
      containerId: "workspace-305",
      containerName: "symphony-workspace-col-305-deadbeef",
      hostPath: workspacePath,
      networkDisposition: "reused",
      networkName: "symphony-workspace-network-col-305-deadbeef",
      services: [
        {
          key: "postgres",
          type: "postgres",
          hostname: "db",
          port: 5433,
          containerId: "postgres-305",
          containerName: "symphony-service-postgres-col-305-deadbeef",
          disposition: "reused"
        }
      ],
      envBundle: buildManifestEnvBundle({
        runtimeManifest,
        issueIdentifier: "COL-305",
        issueId: "issue-305",
        workspaceKey: "COL-305",
        workspacePath: "/home/agent/workspace"
      })
    });
    const backend = createDockerWorkspaceBackend({
      image: "ghcr.io/openai/symphony-workspace:latest",
      runtimeManifest,
      commandRunner: async (input) => {
        calls.push([...input.args]);

        if (input.args[0] === "inspect") {
          if (input.args[3]?.startsWith("symphony-service-postgres-")) {
            return {
              exitCode: 1,
              stdout: "[]\n",
              stderr: `Error response from daemon: No such container: ${input.args[3]}`
            };
          }

          return {
            exitCode: 0,
            stdout: buildDockerInspectPayload({
              id: "workspace-305",
              image: "ghcr.io/openai/symphony-workspace:latest",
              name: input.args[3] ?? "unknown",
              issueIdentifier: "COL-305",
              workspaceKey: "COL-305",
              hostPath: workspacePath,
              workspacePath: "/home/agent/workspace",
              running: true
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

        if (input.args[0] === "network" && input.args[1] === "inspect") {
          return {
            exitCode: 1,
            stdout: "[]\n",
            stderr: `Error response from daemon: No such network: ${input.args[2]}`
          };
        }

        throw new Error(`Unexpected docker command: ${input.args.join(" ")}`);
      }
    });

    await expect(
      backend.cleanupWorkspace({
        issueIdentifier: "COL-305",
        workspace,
        config: config.workspace,
        hooks: config.hooks
      })
    ).resolves.toMatchObject({
      backendKind: "docker",
      workerHost: null,
      hostPath: workspacePath,
      runtimePath: "/home/agent/workspace",
      containerId: "workspace-305",
      containerName: "symphony-workspace-col-305-deadbeef",
      networkName: "symphony-workspace-network-col-305-deadbeef",
      networkRemovalDisposition: "missing",
      serviceCleanup: [
        {
          key: "postgres",
          type: "postgres",
          containerId: null,
          containerName: expect.stringMatching(
            /^symphony-service-postgres-col-305-[0-9a-f]{8}$/
          ),
          removalDisposition: "missing"
        }
      ],
      beforeRemoveHookOutcome: "skipped",
      workspaceRemovalDisposition: "removed",
      containerRemovalDisposition: "removed"
    });

    expect(calls.map((call) => call[0])).toEqual([
      "inspect",
      "inspect",
      "rm",
      "inspect",
      "network"
    ]);
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
  envBundle?: ReturnType<typeof ambientEnvBundle> | ReturnType<typeof buildManifestEnvBundle>;
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
  memoryMb: number;
  cpuShares: number;
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
          "dev.symphony.service-memory-mb": String(input.memoryMb),
          "dev.symphony.service-cpu-shares": String(input.cpuShares),
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

function buildManifestEnvBundle(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  issueIdentifier: string;
  issueId: string | null;
  workspaceKey: string;
  workspacePath: string;
}) {
  return resolveSymphonyRuntimeEnvBundle({
    manifest: input.runtimeManifest.manifest,
    repoRoot: input.runtimeManifest.repoRoot,
    environmentSource: {
      OPENAI_API_KEY: "test-openai-key"
    },
    runtime: {
      issueId: input.issueId,
      issueIdentifier: input.issueIdentifier,
      runId: "run-test",
      workspaceKey: input.workspaceKey,
      workspacePath: input.workspacePath,
      backendKind: "docker"
    },
    services: {
      postgres: {
        type: "postgres",
        serviceKey: "postgres",
        host: "db",
        port: 5433,
        database: "app",
        username: "app",
        password: "secret",
        connectionString: buildSymphonyRuntimePostgresConnectionString({
          host: "db",
          port: 5433,
          database: "app",
          username: "app",
          password: "secret"
        })
      }
    },
    manifestPath: input.runtimeManifest.manifestPath
  });
}
