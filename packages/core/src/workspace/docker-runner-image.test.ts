import { describe, expect, it } from "vitest";
import {
  defaultSymphonyDockerWorkspaceImage,
  preflightSymphonyDockerWorkspaceImage,
  resolveSymphonyDockerWorkspaceImage
} from "./docker-runner-image.js";
import type { DockerWorkspaceCommandRunner } from "./docker-shared.js";

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
        argsPrefix: [
          "run",
          "--rm",
          "--entrypoint",
          "bash",
          defaultSymphonyDockerWorkspaceImage,
          "-lc"
        ],
        result: {
          exitCode: 1,
          stdout: "pnpm\npsql\n",
          stderr: ""
        }
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner
      })
    ).rejects.toThrowError(/missing required tools: pnpm, psql/i);
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
        argsPrefix: [
          "run",
          "--rm",
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
      }
    ]);

    await expect(
      preflightSymphonyDockerWorkspaceImage({
        image: defaultSymphonyDockerWorkspaceImage,
        commandRunner: runner
      })
    ).resolves.toEqual({
      image: defaultSymphonyDockerWorkspaceImage,
      shell: "bash",
      serverVersion: "27.0.1",
      imageId: "sha256:runner",
      requiredTools: [
        "bash",
        "git",
        "node",
        "corepack",
        "pnpm",
        "python3",
        "psql",
        "rg"
      ]
    });
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
