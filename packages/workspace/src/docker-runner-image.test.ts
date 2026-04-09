import { describe, expect, it } from "vitest";
import {
  defaultSymphonyDockerWorkspaceImage,
  defaultSymphonyDockerWorkspacePreflightCreatedTtlMs,
  defaultSymphonyDockerWorkspacePreflightRunningTtlMs,
  preflightSymphonyDockerWorkspaceImage,
  resolveSymphonyDockerWorkspaceImage
} from "./docker-runner-image.js";
import type { DockerWorkspaceCommandRunner } from "./docker-shared.js";

const managedPreflightPsArgs = [
  "ps",
  "-a",
  "--filter",
  "label=dev.symphony.workspace-backend=docker",
  "--filter",
  "label=dev.symphony.managed-kind=workspace_preflight",
  "--format",
  "{{json .}}"
];

describe("docker runner image", () => {
  it("falls back to the supported local image when no override is provided", () => {
    expect(resolveSymphonyDockerWorkspaceImage(null)).toEqual({
      image: defaultSymphonyDockerWorkspaceImage,
      imageSelectionSource: "default"
    });
  });

  it("preserves explicit image overrides", () => {
    expect(
      resolveSymphonyDockerWorkspaceImage(
        " example.com/custom/symphony-runner:dev "
      )
    ).toEqual({
      image: "example.com/custom/symphony-runner:dev",
      imageSelectionSource: "env"
    });
  });

  it("fails clearly when docker is unavailable", async () => {
    const runner = createCommandRunner([
      {
        args: ["version", "--format", "{{.Server.Version}}"],
        result: {
          exitCode: 1,
          stdout: "",
          stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock."
        }
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner
      })
    ).rejects.toThrowError(/reachable Docker CLI and daemon/i);
  });

  it("fails clearly when the image is missing locally", async () => {
    const runner = createCommandRunner([
      {
        args: ["version", "--format", "{{.Server.Version}}"],
        result: {
          exitCode: 0,
          stdout: "27.0.1\n",
          stderr: ""
        }
      },
      {
        args: [
          "image",
          "inspect",
          "--format",
          "{{.Id}}",
          defaultSymphonyDockerWorkspaceImage
        ],
        result: {
          exitCode: 1,
          stdout: "",
          stderr: `Error response from daemon: No such image: ${defaultSymphonyDockerWorkspaceImage}`
        }
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner
      })
    ).rejects.toThrowError(/Build the supported local runner image/i);
  });

  it("fails clearly when the image is missing required tools", async () => {
    const runner = createCommandRunner([
      {
        args: ["version", "--format", "{{.Server.Version}}"],
        result: {
          exitCode: 0,
          stdout: "27.0.1\n",
          stderr: ""
        }
      },
      {
        args: [
          "image",
          "inspect",
          "--format",
          "{{.Id}}",
          defaultSymphonyDockerWorkspaceImage
        ],
        result: {
          exitCode: 0,
          stdout: "sha256:runner\n",
          stderr: ""
        }
      },
      {
        args: managedPreflightPsArgs,
        result: {
          exitCode: 0,
          stdout: "",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "run",
          "--rm",
          "--name",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/),
          "--label",
          "dev.symphony.workspace-backend=docker",
          "--label",
          "dev.symphony.managed-kind=workspace_preflight",
          "--entrypoint",
          "bash",
          defaultSymphonyDockerWorkspaceImage,
          "-lc"
        ],
        result: {
          exitCode: 1,
          stdout: "pi\npnpm\npsql\n",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "rm",
          "-f",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 1,
          stdout: "",
          stderr: "Error response from daemon: No such container"
        }
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner
      })
    ).rejects.toThrowError(/missing required tools: pi, pnpm, psql/i);
  });

  it("fails clearly when the configured shell does not exist in the image", async () => {
    const runner = createCommandRunner([
      {
        args: ["version", "--format", "{{.Server.Version}}"],
        result: {
          exitCode: 0,
          stdout: "27.0.1\n",
          stderr: ""
        }
      },
      {
        args: [
          "image",
          "inspect",
          "--format",
          "{{.Id}}",
          defaultSymphonyDockerWorkspaceImage
        ],
        result: {
          exitCode: 0,
          stdout: "sha256:runner\n",
          stderr: ""
        }
      },
      {
        args: managedPreflightPsArgs,
        result: {
          exitCode: 0,
          stdout: "",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "run",
          "--rm",
          "--name",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/),
          "--label",
          "dev.symphony.workspace-backend=docker",
          "--label",
          "dev.symphony.managed-kind=workspace_preflight",
          "--entrypoint",
          "fish",
          defaultSymphonyDockerWorkspaceImage,
          "-lc"
        ],
        result: {
          exitCode: 127,
          stdout: "",
          stderr:
            'docker: Error response from daemon: failed to create task for container: exec: "fish": executable file not found in $PATH'
        }
      },
      {
        argsPrefix: [
          "rm",
          "-f",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 1,
          stdout: "",
          stderr: "Error response from daemon: No such container"
        }
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        shell: "fish",
        commandRunner: runner
      })
    ).rejects.toThrowError(/does not provide the configured shell fish/i);
  });

  it("returns a usable preflight summary when docker and the image are ready", async () => {
    const runner = createCommandRunner([
      {
        args: ["version", "--format", "{{.Server.Version}}"],
        result: {
          exitCode: 0,
          stdout: "27.0.1\n",
          stderr: ""
        }
      },
      {
        args: [
          "image",
          "inspect",
          "--format",
          "{{.Id}}",
          defaultSymphonyDockerWorkspaceImage
        ],
        result: {
          exitCode: 0,
          stdout: "sha256:runner\n",
          stderr: ""
        }
      },
      {
        args: managedPreflightPsArgs,
        result: {
          exitCode: 0,
          stdout: "",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "run",
          "--rm",
          "--name",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/),
          "--label",
          "dev.symphony.workspace-backend=docker",
          "--label",
          "dev.symphony.managed-kind=workspace_preflight",
          "--entrypoint",
          "bash",
          defaultSymphonyDockerWorkspaceImage,
          "-lc"
        ],
        result: {
          exitCode: 0,
          stdout: "",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "rm",
          "-f",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 1,
          stdout: "",
          stderr: "Error response from daemon: No such container"
        }
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner
      })
    ).resolves.toMatchObject({
      image: defaultSymphonyDockerWorkspaceImage,
      shell: "bash",
      serverVersion: "27.0.1",
      imageId: "sha256:runner",
      requiredTools: [
        "bash",
        "gh",
        "git",
        "node",
        "corepack",
        "pi",
        "pnpm",
        "python3",
        "psql",
        "rg"
      ],
      cleanup: {
        staleContainersDetected: 0,
        staleContainersRemoved: 0,
        staleContainersFailedToRemove: 0,
        preservedContainers: 0,
        createdContainerTtlMs:
          defaultSymphonyDockerWorkspacePreflightCreatedTtlMs,
        runningContainerTtlMs:
          defaultSymphonyDockerWorkspacePreflightRunningTtlMs,
        sweepFailed: false,
        currentContainerCleanupDisposition: "missing"
      }
    });
  });

  it("removes exited managed preflight containers before starting a new preflight", async () => {
    const runner = createCommandRunner([
      {
        args: ["version", "--format", "{{.Server.Version}}"],
        result: {
          exitCode: 0,
          stdout: "27.0.1\n",
          stderr: ""
        }
      },
      {
        args: [
          "image",
          "inspect",
          "--format",
          "{{.Id}}",
          defaultSymphonyDockerWorkspaceImage
        ],
        result: {
          exitCode: 0,
          stdout: "sha256:runner\n",
          stderr: ""
        }
      },
      {
        args: managedPreflightPsArgs,
        result: {
          exitCode: 0,
          stdout: createDockerPsLine({
            name: "symphony-workspace-preflight-stale",
            state: "exited"
          }),
          stderr: ""
        }
      },
      {
        args: ["rm", "-f", "symphony-workspace-preflight-stale"],
        result: {
          exitCode: 0,
          stdout: "",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "run",
          "--rm",
          "--name",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 0,
          stdout: "",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "rm",
          "-f",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 1,
          stdout: "",
          stderr: "Error response from daemon: No such container"
        }
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner
      })
    ).resolves.toMatchObject({
      cleanup: {
        staleContainersDetected: 1,
        staleContainersRemoved: 1,
        staleContainersFailedToRemove: 0,
        preservedContainers: 0,
        sweepFailed: false,
        currentContainerCleanupDisposition: "missing"
      }
    });
  });

  it("preserves recently created managed preflight containers", async () => {
    const createdAt = new Date(Date.now() - 5_000).toISOString();
    const runner = createCommandRunner([
      {
        args: ["version", "--format", "{{.Server.Version}}"],
        result: {
          exitCode: 0,
          stdout: "27.0.1\n",
          stderr: ""
        }
      },
      {
        args: [
          "image",
          "inspect",
          "--format",
          "{{.Id}}",
          defaultSymphonyDockerWorkspaceImage
        ],
        result: {
          exitCode: 0,
          stdout: "sha256:runner\n",
          stderr: ""
        }
      },
      {
        args: managedPreflightPsArgs,
        result: {
          exitCode: 0,
          stdout: createDockerPsLine({
            name: "symphony-workspace-preflight-recent",
            state: "created"
          }),
          stderr: ""
        }
      },
      {
        args: [
          "inspect",
          "--type",
          "container",
          "symphony-workspace-preflight-recent"
        ],
        result: {
          exitCode: 0,
          stdout: JSON.stringify([
            {
              Created: createdAt,
              State: {
                Status: "created",
                StartedAt: "0001-01-01T00:00:00Z"
              }
            }
          ]),
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "run",
          "--rm",
          "--name",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 0,
          stdout: "",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "rm",
          "-f",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 1,
          stdout: "",
          stderr: "Error response from daemon: No such container"
        }
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner,
        staleCreatedTtlMs: 60_000
      })
    ).resolves.toMatchObject({
      cleanup: {
        staleContainersDetected: 0,
        staleContainersRemoved: 0,
        staleContainersFailedToRemove: 0,
        preservedContainers: 1,
        sweepFailed: false,
        currentContainerCleanupDisposition: "missing"
      }
    });
  });

  it("removes stale running managed preflight containers after the ttl expires", async () => {
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const runner = createCommandRunner([
      {
        args: ["version", "--format", "{{.Server.Version}}"],
        result: {
          exitCode: 0,
          stdout: "27.0.1\n",
          stderr: ""
        }
      },
      {
        args: [
          "image",
          "inspect",
          "--format",
          "{{.Id}}",
          defaultSymphonyDockerWorkspaceImage
        ],
        result: {
          exitCode: 0,
          stdout: "sha256:runner\n",
          stderr: ""
        }
      },
      {
        args: managedPreflightPsArgs,
        result: {
          exitCode: 0,
          stdout: createDockerPsLine({
            name: "symphony-workspace-preflight-hung",
            state: "running"
          }),
          stderr: ""
        }
      },
      {
        args: [
          "inspect",
          "--type",
          "container",
          "symphony-workspace-preflight-hung"
        ],
        result: {
          exitCode: 0,
          stdout: JSON.stringify([
            {
              Created: startedAt,
              State: {
                Status: "running",
                StartedAt: startedAt
              }
            }
          ]),
          stderr: ""
        }
      },
      {
        args: ["rm", "-f", "symphony-workspace-preflight-hung"],
        result: {
          exitCode: 0,
          stdout: "",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "run",
          "--rm",
          "--name",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 0,
          stdout: "",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "rm",
          "-f",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 1,
          stdout: "",
          stderr: "Error response from daemon: No such container"
        }
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner,
        staleRunningTtlMs: 60_000
      })
    ).resolves.toMatchObject({
      cleanup: {
        staleContainersDetected: 1,
        staleContainersRemoved: 1,
        staleContainersFailedToRemove: 0,
        preservedContainers: 0,
        sweepFailed: false,
        currentContainerCleanupDisposition: "missing"
      }
    });
  });

  it("preserves running managed preflight containers when inspect cannot prove staleness", async () => {
    const runner = createCommandRunner([
      {
        args: ["version", "--format", "{{.Server.Version}}"],
        result: {
          exitCode: 0,
          stdout: "27.0.1\n",
          stderr: ""
        }
      },
      {
        args: [
          "image",
          "inspect",
          "--format",
          "{{.Id}}",
          defaultSymphonyDockerWorkspaceImage
        ],
        result: {
          exitCode: 0,
          stdout: "sha256:runner\n",
          stderr: ""
        }
      },
      {
        args: managedPreflightPsArgs,
        result: {
          exitCode: 0,
          stdout: createDockerPsLine({
            name: "symphony-workspace-preflight-running",
            state: "running"
          }),
          stderr: ""
        }
      },
      {
        args: [
          "inspect",
          "--type",
          "container",
          "symphony-workspace-preflight-running"
        ],
        result: {
          exitCode: 1,
          stdout: "",
          stderr: "daemon is restarting"
        }
      },
      {
        argsPrefix: [
          "run",
          "--rm",
          "--name",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 0,
          stdout: "",
          stderr: ""
        }
      },
      {
        argsPrefix: [
          "rm",
          "-f",
          expect.stringMatching(/^symphony-workspace-preflight-\d+-[a-z0-9]+$/)
        ],
        result: {
          exitCode: 1,
          stdout: "",
          stderr: "Error response from daemon: No such container"
        }
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner,
        staleRunningTtlMs: 60_000
      })
    ).resolves.toMatchObject({
      cleanup: {
        staleContainersDetected: 0,
        staleContainersRemoved: 0,
        staleContainersFailedToRemove: 0,
        preservedContainers: 1,
        sweepFailed: false,
        currentContainerCleanupDisposition: "missing"
      }
    });
  });

  it("force-removes the current preflight container when docker run times out", async () => {
    const calls: string[][] = [];
    const runner: DockerWorkspaceCommandRunner = async ({ args }) => {
      calls.push(args);

      if (args[0] === "version") {
        return {
          exitCode: 0,
          stdout: "27.0.1\n",
          stderr: ""
        };
      }

      if (args[0] === "image") {
        return {
          exitCode: 0,
          stdout: "sha256:runner\n",
          stderr: ""
        };
      }

      if (args[0] === "ps") {
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      }

      if (args[0] === "run") {
        throw new Error("Docker command timed out after 30000ms.");
      }

      if (args[0] === "rm") {
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      }

      throw new Error(`Unexpected docker command: ${args.join(" ")}`);
    };

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner
      })
    ).rejects.toThrowError(/timed out/i);

    expect(calls.some((args) => args[0] === "rm" && args[1] === "-f")).toBe(true);
  });
});

function createCommandRunner(
  expectations: Array<{
    args?: string[];
    argsPrefix?: string[];
    result: {
      exitCode: number;
      stdout: string;
      stderr: string;
    };
  }>
): DockerWorkspaceCommandRunner {
  return async ({ args }) => {
    const expectation = expectations.shift();
    if (!expectation) {
      throw new Error(`Unexpected docker command: ${args.join(" ")}`);
    }

    if (expectation.args) {
      expect(args).toEqual(expectation.args);
    }

    if (expectation.argsPrefix) {
      expect(args.slice(0, expectation.argsPrefix.length)).toEqual(
        expectation.argsPrefix
      );
    }

    return expectation.result;
  };
}

function createDockerPsLine(input: { name: string; state: string }): string {
  return `${JSON.stringify({
    Names: input.name,
    State: input.state
  })}\n`;
}
