import { Writable } from "node:stream";
import {
  NotFoundError,
  type ContainerCreateRequest,
  type ExecConfig
} from "@docker/node-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createDockerWorkspaceCommandRunner,
  type DockerClientFactory
} from "./docker-client.js";

describe("docker client command runner", () => {
  it("routes version, image inspect, exec, and run through the docker SDK", async () => {
    const createdContainerIds: string[] = [];
    const createdExecIds: string[] = [];
    const client = {
      close: vi.fn(async () => undefined),
      systemVersion: vi.fn(async () => ({ ServerVersion: "25.0.0" })),
      imageInspect: vi.fn(async () => ({ Id: "sha256:image" })),
      containerInspect: vi.fn(async () => ({
        Id: "container-1",
        Name: "/container-1",
        Image: "image",
        State: { Running: true, Status: "running" },
        Config: { Labels: {}, Env: [] },
        Mounts: [],
        NetworkSettings: { Networks: {} }
      })),
      containerDelete: vi.fn(async () => undefined),
      containerStop: vi.fn(async () => undefined),
      containerStart: vi.fn(async (id: string) => {
        createdContainerIds.push(id);
        return undefined;
      }),
      containerCreate: vi.fn(
        async (
          request: ContainerCreateRequest,
          options: { name?: string; platform?: string } | undefined
        ) => {
        createdContainerIds.push(options?.name ?? "unnamed");
        expect(request.Image).toBe("postgres:16");
        expect(request.Cmd).toEqual(["postgres", "-p", "5432"]);
        expect(request.Entrypoint).toEqual(["sh"]);
        expect(request.Env).toContain("POSTGRES_DB=postgres");
        expect(request.HostConfig?.PortBindings).toEqual({
          "5432/tcp": [{ HostPort: "5432" }]
        });
        expect(request.HostConfig?.Mounts).toEqual([
          {
            Type: "bind",
            Source: "/source",
            Target: "/workspace",
            ReadOnly: true
          }
        ]);
        expect(request.HostConfig?.Tmpfs).toEqual({
          "/tmp/symphony-home": "exec,mode=0777"
        });

        return {
          Id: "container-created",
          Warnings: []
        };
        }
      ),
      containerWait: vi.fn(async () => ({ StatusCode: 0 })),
      containerExec: vi.fn(async (_id: string, execConfig: ExecConfig) => {
        expect(execConfig.Cmd).toEqual(["sh", "-lc", "echo hi"]);
        expect(execConfig.Env).toContain("FOO=bar");
        expect(execConfig.WorkingDir).toBe("/workspace");
        createdExecIds.push("exec-created");
        return { Id: "exec-1" };
      }),
      execStart: vi.fn(
        async (
          _id: string,
          stdout: Writable | null,
          stderr: Writable | null
        ) => {
          stdout?.write("hello from stdout\n");
          stderr?.write("hello from stderr\n");
          stdout?.end();
          stderr?.end();
          return undefined;
        }
      ),
      execInspect: vi.fn(async () => ({ ExitCode: 0 })),
      containerLogs: vi.fn(async () => undefined),
      volumeInspect: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeCreate: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeDelete: vi.fn(async () => undefined),
      networkInspect: vi.fn(async () => ({
        Id: "network-1",
        Name: "symphony-net",
        Labels: {}
      })),
      networkDelete: vi.fn(async () => undefined)
    };
    const factory: DockerClientFactory = async () => client as never;
    const runner = createDockerWorkspaceCommandRunner({
      clientFactory: factory
    });

    const versionResult = await runner({
      args: ["version", "--format", "{{.Server.Version}}"],
      timeoutMs: 1000
    });
    const imageResult = await runner({
      args: ["image", "inspect", "--format", "{{.Id}}", "symphony/workspace-runner:local"],
      timeoutMs: 1000
    });
    const execResult = await runner({
      args: [
        "exec",
        "--env",
        "FOO=bar",
        "--workdir",
        "/workspace",
        "container-1",
        "sh",
        "-lc",
        "echo hi"
      ],
      timeoutMs: 1000
    });
    const runResult = await runner({
      args: [
        "run",
        "-d",
        "--name",
        "symphony-test",
        "--entrypoint",
        "sh",
        "--mount",
        "type=bind,src=/source,dst=/workspace,ro",
        "--tmpfs",
        "/tmp/symphony-home:exec,mode=0777",
        "--publish",
        "5432:5432",
        "--env",
        "POSTGRES_DB=postgres",
        "postgres:16",
        "postgres",
        "-p",
        "5432"
      ],
      timeoutMs: 1000
    });

    expect(versionResult.stdout.trim()).toBe("25.0.0");
    expect(imageResult.stdout.trim()).toBe("sha256:image");
    expect(execResult.exitCode).toBe(0);
    expect(execResult.stdout).toContain("hello from stdout");
    expect(execResult.stderr).toContain("hello from stderr");
    expect(runResult.exitCode).toBe(0);
    expect(runResult.stdout.trim()).toBe("container-created");
    expect(createdExecIds).toEqual(["exec-created"]);
    expect(client.close).toHaveBeenCalledTimes(4);
  });

  it("renders missing-object errors in the docker CLI shape", async () => {
    const client = {
      close: vi.fn(async () => undefined),
      systemVersion: vi.fn(async () => ({ ServerVersion: "25.0.0" })),
      imageInspect: vi.fn(async () => {
        throw new NotFoundError("missing image");
      }),
      containerInspect: vi.fn(async () => {
        throw new NotFoundError("missing container");
      }),
      containerDelete: vi.fn(async () => undefined),
      containerStop: vi.fn(async () => undefined),
      containerStart: vi.fn(async () => undefined),
      containerCreate: vi.fn(async () => ({ Id: "container-1", Warnings: [] })),
      containerWait: vi.fn(async () => ({ StatusCode: 0 })),
      containerExec: vi.fn(async () => ({ Id: "exec-1" })),
      execStart: vi.fn(async () => undefined),
      execInspect: vi.fn(async () => ({ ExitCode: 0 })),
      containerLogs: vi.fn(async () => undefined),
      volumeInspect: vi.fn(async () => {
        throw new NotFoundError("missing volume");
      }),
      volumeCreate: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeDelete: vi.fn(async () => undefined),
      networkInspect: vi.fn(async () => {
        throw new NotFoundError("missing network");
      }),
      networkDelete: vi.fn(async () => undefined)
    };
    const runner = createDockerWorkspaceCommandRunner({
      clientFactory: async () => client as never
    });

    const imageResult = await runner({
      args: ["image", "inspect", "--format", "{{.Id}}", "missing-image"],
      timeoutMs: 1000
    });
    const containerResult = await runner({
      args: ["inspect", "--type", "container", "missing-container"],
      timeoutMs: 1000
    });

    expect(imageResult.exitCode).toBe(1);
    expect(imageResult.stderr).toContain("No such image: missing-image");
    expect(containerResult.exitCode).toBe(1);
    expect(containerResult.stderr).toContain("No such container: missing-container");
    expect(client.close).toHaveBeenCalledTimes(2);
  });

  it("treats shaped not-found errors as missing objects even without instanceof", async () => {
    const client = {
      close: vi.fn(async () => undefined),
      systemVersion: vi.fn(async () => ({ ServerVersion: "25.0.0" })),
      imageInspect: vi.fn(async () => ({ Id: "sha256:image" })),
      containerInspect: vi.fn(async () => {
        const error = new Error("container not found");
        error.name = "NotFoundError";
        throw error;
      }),
      containerDelete: vi.fn(async () => undefined),
      containerStop: vi.fn(async () => undefined),
      containerStart: vi.fn(async () => undefined),
      containerCreate: vi.fn(async () => ({ Id: "container-1", Warnings: [] })),
      containerWait: vi.fn(async () => ({ StatusCode: 0 })),
      containerExec: vi.fn(async () => ({ Id: "exec-1" })),
      execStart: vi.fn(async () => undefined),
      execInspect: vi.fn(async () => ({ ExitCode: 0 })),
      containerLogs: vi.fn(async () => undefined),
      volumeInspect: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeCreate: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeDelete: vi.fn(async () => undefined),
      networkInspect: vi.fn(async () => ({
        Id: "network-1",
        Name: "symphony-net",
        Labels: {}
      })),
      networkDelete: vi.fn(async () => undefined)
    };
    const runner = createDockerWorkspaceCommandRunner({
      clientFactory: async () => client as never
    });

    const containerResult = await runner({
      args: ["inspect", "--type", "container", "missing-container"],
      timeoutMs: 1000
    });

    expect(containerResult.exitCode).toBe(1);
    expect(containerResult.stderr).toContain("No such container: missing-container");
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("treats thrown not-found classes as missing objects", async () => {
    class ShapedNotFoundError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
      }
    }

    const client = {
      close: vi.fn(async () => undefined),
      systemVersion: vi.fn(async () => ({ ServerVersion: "25.0.0" })),
      imageInspect: vi.fn(async () => ({ Id: "sha256:image" })),
      containerInspect: vi.fn(async () => {
        throw ShapedNotFoundError;
      }),
      containerDelete: vi.fn(async () => undefined),
      containerStop: vi.fn(async () => undefined),
      containerStart: vi.fn(async () => undefined),
      containerCreate: vi.fn(async () => ({ Id: "container-1", Warnings: [] })),
      containerWait: vi.fn(async () => ({ StatusCode: 0 })),
      containerExec: vi.fn(async () => ({ Id: "exec-1" })),
      execStart: vi.fn(async () => undefined),
      execInspect: vi.fn(async () => ({ ExitCode: 0 })),
      containerLogs: vi.fn(async () => undefined),
      volumeInspect: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeCreate: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeDelete: vi.fn(async () => undefined),
      networkInspect: vi.fn(async () => ({
        Id: "network-1",
        Name: "symphony-net",
        Labels: {}
      })),
      networkDelete: vi.fn(async () => undefined)
    };
    const runner = createDockerWorkspaceCommandRunner({
      clientFactory: async () => client as never
    });

    const containerResult = await runner({
      args: ["inspect", "--type", "container", "missing-container"],
      timeoutMs: 1000
    });

    expect(containerResult.exitCode).toBe(1);
    expect(containerResult.stderr).toContain("No such container: missing-container");
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("retries transient docker exec upgrade failures", async () => {
    const createdExecIds: string[] = [];
    let execStartCalls = 0;
    const client = {
      close: vi.fn(async () => undefined),
      systemVersion: vi.fn(async () => ({ ServerVersion: "25.0.0" })),
      imageInspect: vi.fn(async () => ({ Id: "sha256:image" })),
      containerInspect: vi.fn(async () => ({
        Id: "container-1",
        Name: "/container-1",
        Image: "image",
        State: { Running: true, Status: "running" },
        Config: { Labels: {}, Env: [] },
        Mounts: [],
        NetworkSettings: { Networks: {} }
      })),
      containerDelete: vi.fn(async () => undefined),
      containerStop: vi.fn(async () => undefined),
      containerStart: vi.fn(async () => undefined),
      containerCreate: vi.fn(async () => ({ Id: "container-created", Warnings: [] })),
      containerWait: vi.fn(async () => ({ StatusCode: 0 })),
      containerExec: vi.fn(async () => {
        const id = `exec-${createdExecIds.length + 1}`;
        createdExecIds.push(id);
        return { Id: id };
      }),
      execStart: vi.fn(
        async (
          _id: string,
          stdout: Writable | null,
          stderr: Writable | null
        ) => {
          execStartCalls += 1;
          if (execStartCalls === 1) {
            throw new Error("bad upgrade");
          }

          stdout?.write("hello from stdout\n");
          stderr?.write("hello from stderr\n");
          stdout?.end();
          stderr?.end();
          return undefined;
        }
      ),
      execInspect: vi.fn(async () => ({ ExitCode: 0 })),
      containerLogs: vi.fn(async () => undefined),
      volumeInspect: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeCreate: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeDelete: vi.fn(async () => undefined),
      networkInspect: vi.fn(async () => ({
        Id: "network-1",
        Name: "symphony-net",
        Labels: {}
      })),
      networkDelete: vi.fn(async () => undefined)
    };
    const runner = createDockerWorkspaceCommandRunner({
      clientFactory: async () => client as never
    });

    const execResult = await runner({
      args: ["exec", "container-1", "sh", "-lc", "echo hi"],
      timeoutMs: 1000
    });

    expect(execResult.exitCode).toBe(0);
    expect(execResult.stdout).toContain("hello from stdout");
    expect(execResult.stderr).toContain("hello from stderr");
    expect(createdExecIds).toEqual(["exec-1", "exec-2"]);
    expect(client.execStart).toHaveBeenCalledTimes(2);
    expect(client.execInspect).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("falls back to the docker CLI when exec upgrades keep failing", async () => {
    const cliRunner = vi.fn(async () => ({
      exitCode: 0,
      stdout: "fallback stdout\n",
      stderr: ""
    }));
    const client = {
      close: vi.fn(async () => undefined),
      systemVersion: vi.fn(async () => ({ ServerVersion: "25.0.0" })),
      imageInspect: vi.fn(async () => ({ Id: "sha256:image" })),
      containerInspect: vi.fn(async () => ({
        Id: "container-1",
        Name: "/container-1",
        Image: "image",
        State: { Running: true, Status: "running" },
        Config: { Labels: {}, Env: [] },
        Mounts: [],
        NetworkSettings: { Networks: {} }
      })),
      containerDelete: vi.fn(async () => undefined),
      containerStop: vi.fn(async () => undefined),
      containerStart: vi.fn(async () => undefined),
      containerCreate: vi.fn(async () => ({ Id: "container-created", Warnings: [] })),
      containerWait: vi.fn(async () => ({ StatusCode: 0 })),
      containerExec: vi.fn(async (_id: string, execConfig: ExecConfig) => {
        expect(execConfig.Cmd).toEqual(["sh", "-lc", "echo hi"]);
        return { Id: "exec-1" };
      }),
      execStart: vi.fn(async () => {
        throw new Error("bad upgrade");
      }),
      execInspect: vi.fn(async () => ({ ExitCode: 0 })),
      containerLogs: vi.fn(async () => undefined),
      volumeInspect: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeCreate: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeDelete: vi.fn(async () => undefined),
      networkInspect: vi.fn(async () => ({
        Id: "network-1",
        Name: "symphony-net",
        Labels: {}
      })),
      networkDelete: vi.fn(async () => undefined)
    };
    const runner = createDockerWorkspaceCommandRunner({
      clientFactory: async () => client as never,
      cliRunner
    });

    const execResult = await runner({
      args: ["exec", "container-1", "sh", "-lc", "echo hi"],
      timeoutMs: 1000
    });

    expect(execResult.exitCode).toBe(0);
    expect(execResult.stdout).toContain("fallback stdout");
    expect(client.containerExec).toHaveBeenCalledTimes(3);
    expect(client.execStart).toHaveBeenCalledTimes(3);
    expect(cliRunner).toHaveBeenCalledTimes(1);
    expect(cliRunner).toHaveBeenCalledWith({
      args: ["exec", "container-1", "sh", "-lc", "echo hi"],
      timeoutMs: 30_000
    });
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("cleans up --rm docker run containers even when log collection fails", async () => {
    const client = {
      close: vi.fn(async () => undefined),
      systemVersion: vi.fn(async () => ({ ServerVersion: "25.0.0" })),
      imageInspect: vi.fn(async () => ({ Id: "sha256:image" })),
      containerInspect: vi.fn(async () => ({
        Id: "container-1",
        Name: "/container-1",
        Image: "image",
        State: { Running: true, Status: "running" },
        Config: { Labels: {}, Env: [] },
        Mounts: [],
        NetworkSettings: { Networks: {} }
      })),
      containerDelete: vi.fn(async () => undefined),
      containerStop: vi.fn(async () => undefined),
      containerStart: vi.fn(async () => undefined),
      containerCreate: vi.fn(async () => ({ Id: "container-created", Warnings: [] })),
      containerWait: vi.fn(async () => ({ StatusCode: 0 })),
      containerExec: vi.fn(async () => ({ Id: "exec-1" })),
      execStart: vi.fn(async () => undefined),
      execInspect: vi.fn(async () => ({ ExitCode: 0 })),
      containerLogs: vi.fn(async () => {
        throw new Error("stream failed");
      }),
      volumeInspect: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeCreate: vi.fn(async () => ({
        Name: "volume-1",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/volume-1",
        Labels: {},
        Scope: "local",
        Options: {}
      })),
      volumeDelete: vi.fn(async () => undefined),
      networkInspect: vi.fn(async () => ({
        Id: "network-1",
        Name: "symphony-net",
        Labels: {}
      })),
      networkDelete: vi.fn(async () => undefined)
    };
    const runner = createDockerWorkspaceCommandRunner({
      clientFactory: async () => client as never
    });

    const result = await runner({
      args: [
        "run",
        "--rm",
        "--entrypoint",
        "bash",
        "symphony/workspace-runner:local",
        "-lc",
        "echo hi"
      ],
      timeoutMs: 1000
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("stream failed");
    expect(client.containerDelete).toHaveBeenCalledWith("container-created", {
      force: true
    });
    expect(client.close).toHaveBeenCalledTimes(1);
  });
});
