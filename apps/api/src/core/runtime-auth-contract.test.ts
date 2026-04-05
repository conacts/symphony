import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveDockerGitHubCliAuthContract,
  resolveDockerPiAuthContract,
  resolveDockerWorkspaceAuthContracts
} from "./runtime-auth-contract.js";

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

describe("pi auth contract", () => {
  it("mounts host gh config when present", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-gh-auth-"));
    tempDirectories.push(root);
    const home = path.join(root, "home");
    await mkdir(path.join(home, ".config", "gh"), {
      recursive: true
    });
    await writeFile(
      path.join(home, ".config", "gh", "hosts.yml"),
      "github.com:\n    oauth_token: test\n",
      "utf8"
    );

    expect(
      resolveDockerGitHubCliAuthContract({
        HOME: home
      })
    ).toEqual({
      mount: {
        sourcePath: path.join(home, ".config", "gh"),
        containerPath: "/home/agent/.config/gh",
        readOnly: true
      },
      configDirectoryPath: path.join(home, ".config", "gh")
    });
  });

  it("mounts host Pi auth when present under the standard path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-pi-auth-"));
    tempDirectories.push(root);
    const home = path.join(root, "home");
    await mkdir(path.join(home, ".pi", "agent"), {
      recursive: true
    });
    await writeFile(
      path.join(home, ".pi", "agent", "auth.json"),
      '{"ok":true}\n'
    );

    expect(
      resolveDockerPiAuthContract({
        HOME: home
      })
    ).toEqual({
      mount: {
        sourcePath: path.join(home, ".pi", "agent", "auth.json"),
        containerPath: "/home/agent/.pi/agent/auth.json",
        readOnly: true
      },
      launchEnv: {},
      authFilePath: path.join(home, ".pi", "agent", "auth.json"),
      providerEnvKey: null
    });
  });

  it("does not mount Pi auth from non-standard locations", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-pi-auth-"));
    tempDirectories.push(root);
    const agentDir = path.join(root, "pi-agent");
    await mkdir(agentDir, {
      recursive: true
    });
    await writeFile(path.join(agentDir, "auth.json"), '{"ok":true}\n');

    expect(
      resolveDockerPiAuthContract({
        PI_AGENT_DIR: agentDir
      })
    ).toEqual({
      mount: null,
      launchEnv: {},
      authFilePath: null,
      providerEnvKey: null
    });
  });

  it("passes the configured provider api key env through for Pi", () => {
    expect(
      resolveDockerPiAuthContract(
        {
          OPENROUTER_API_KEY: "test-openrouter-api-key"
        },
        {
          preferredApiKeyEnvKey: "OPENROUTER_API_KEY"
        }
      )
    ).toEqual({
      mount: null,
      launchEnv: {
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      },
      authFilePath: null,
      providerEnvKey: "OPENROUTER_API_KEY"
    });
  });

  it("aggregates only github and pi auth mounts without null entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-auth-aggregate-"));
    tempDirectories.push(root);
    const home = path.join(root, "home");
    await mkdir(path.join(home, ".config", "gh"), { recursive: true });
    await mkdir(path.join(home, ".pi", "agent"), { recursive: true });
    await writeFile(
      path.join(home, ".config", "gh", "hosts.yml"),
      "github.com:\n  oauth_token: test\n",
      "utf8"
    );
    await writeFile(
      path.join(home, ".pi", "agent", "auth.json"),
      '{"ok":true}\n'
    );

    const contracts = resolveDockerWorkspaceAuthContracts({
      HOME: home
    });

    expect(contracts.mounts).toEqual([
      contracts.githubCli.mount,
      contracts.pi.mount
    ]);
  });
});
