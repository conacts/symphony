import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveDockerCodexAuthContract,
  resolveDockerGitHubCliAuthContract,
  resolveDockerOpenCodeAuthContract,
  resolveDockerPiAuthContract,
  resolveDockerWorkspaceAuthContracts
} from "./codex-auth-contract.js";

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

describe("codex auth contract", () => {
  it("prefers a host Codex auth.json mount for docker workspaces", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-auth-"));
    tempDirectories.push(root);
    const home = path.join(root, "home");
    await mkdir(path.join(home, ".codex"), {
      recursive: true
    });
    await writeFile(path.join(home, ".codex", "auth.json"), '{"ok":true}\n');

    expect(
      resolveDockerCodexAuthContract({
        HOME: home
      })
    ).toEqual({
      mode: "auth_json",
      mount: {
        sourcePath: path.join(home, ".codex", "auth.json"),
        containerPath: "/home/agent/auth.json",
        readOnly: true
      },
      launchEnv: {
        CODEX_HOME: "/home/agent"
      },
      authFilePath: path.join(home, ".codex", "auth.json")
    });
  });

  it("passes the configured provider api key env alongside auth.json when present", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-auth-"));
    tempDirectories.push(root);
    const home = path.join(root, "home");
    await mkdir(path.join(home, ".codex"), {
      recursive: true
    });
    await writeFile(path.join(home, ".codex", "auth.json"), '{"ok":true}\n');

    expect(
      resolveDockerCodexAuthContract(
        {
          HOME: home,
          OPENROUTER_API_KEY: "test-openrouter-api-key"
        },
        {
          preferredApiKeyEnvKey: "OPENROUTER_API_KEY"
        }
      )
    ).toEqual({
      mode: "auth_json",
      mount: {
        sourcePath: path.join(home, ".codex", "auth.json"),
        containerPath: "/home/agent/auth.json",
        readOnly: true
      },
      launchEnv: {
        CODEX_HOME: "/home/agent",
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      },
      authFilePath: path.join(home, ".codex", "auth.json")
    });
  });

  it("falls back to host OPENAI_API_KEY when no auth.json is available", () => {
    expect(
      resolveDockerCodexAuthContract({
        OPENAI_API_KEY: "test-openai-api-key"
      })
    ).toEqual({
      mode: "api_key_env",
      mount: null,
      launchEnv: {
        OPENAI_API_KEY: "test-openai-api-key"
      },
      apiKeyEnvKey: "OPENAI_API_KEY",
      authFilePath: null
    });
  });

  it("prefers the configured provider api key env when requested", () => {
    expect(
      resolveDockerCodexAuthContract(
        {
          OPENAI_API_KEY: "test-openai-api-key",
          OPENROUTER_API_KEY: "test-openrouter-api-key"
        },
        {
          preferredApiKeyEnvKey: "OPENROUTER_API_KEY"
        }
      )
    ).toEqual({
      mode: "api_key_env",
      mount: null,
      launchEnv: {
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      },
      apiKeyEnvKey: "OPENROUTER_API_KEY",
      authFilePath: null
    });
  });

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

  it("mounts host OpenCode auth when present under the default data path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-opencode-auth-"));
    tempDirectories.push(root);
    const home = path.join(root, "home");
    await mkdir(path.join(home, ".local", "share", "opencode"), {
      recursive: true
    });
    await writeFile(
      path.join(home, ".local", "share", "opencode", "auth.json"),
      '{"ok":true}\n'
    );

    expect(
      resolveDockerOpenCodeAuthContract({
        HOME: home
      })
    ).toEqual({
      mount: {
        sourcePath: path.join(home, ".local", "share", "opencode", "auth.json"),
        containerPath: "/home/agent/.local/share/opencode/auth.json",
        readOnly: true
      },
      authFilePath: path.join(home, ".local", "share", "opencode", "auth.json")
    });
  });

  it("prefers XDG_DATA_HOME for OpenCode auth when present", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-opencode-auth-"));
    tempDirectories.push(root);
    const dataHome = path.join(root, "data-home");
    await mkdir(path.join(dataHome, "opencode"), {
      recursive: true
    });
    await writeFile(
      path.join(dataHome, "opencode", "auth.json"),
      '{"ok":true}\n'
    );

    expect(
      resolveDockerOpenCodeAuthContract({
        XDG_DATA_HOME: dataHome
      })
    ).toEqual({
      mount: {
        sourcePath: path.join(dataHome, "opencode", "auth.json"),
        containerPath: "/home/agent/.local/share/opencode/auth.json",
        readOnly: true
      },
      authFilePath: path.join(dataHome, "opencode", "auth.json")
    });
  });

  it("mounts host Pi auth when present under the default path", async () => {
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
      authFilePath: path.join(home, ".pi", "agent", "auth.json")
    });
  });

  it("prefers PI_AGENT_DIR for Pi auth when present", async () => {
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
      mount: {
        sourcePath: path.join(agentDir, "auth.json"),
        containerPath: "/home/agent/.pi/agent/auth.json",
        readOnly: true
      },
      launchEnv: {},
      authFilePath: path.join(agentDir, "auth.json")
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
      authFilePath: null
    });
  });

  it("aggregates docker workspace auth mounts without leaking null entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-auth-aggregate-"));
    tempDirectories.push(root);
    const home = path.join(root, "home");
    await mkdir(path.join(home, ".codex"), { recursive: true });
    await mkdir(path.join(home, ".config", "gh"), { recursive: true });
    await mkdir(path.join(home, ".local", "share", "opencode"), {
      recursive: true
    });
    await writeFile(path.join(home, ".codex", "auth.json"), '{"ok":true}\n');
    await writeFile(
      path.join(home, ".config", "gh", "hosts.yml"),
      "github.com:\n  oauth_token: test\n",
      "utf8"
    );
    await writeFile(
      path.join(home, ".local", "share", "opencode", "auth.json"),
      '{"ok":true}\n'
    );

    const contracts = resolveDockerWorkspaceAuthContracts({
      HOME: home
    });

    expect(contracts.mounts).toEqual([
      contracts.codex.mount,
      contracts.githubCli.mount,
      contracts.opencode.mount
    ]);
    expect(contracts.pi.mount).toBeNull();
  });
});
