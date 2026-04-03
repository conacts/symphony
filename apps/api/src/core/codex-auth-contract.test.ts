import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveDockerCodexAuthContract,
  resolveDockerGitHubCliAuthContract
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

  it("falls back to host OPENAI_API_KEY when no auth.json is available", () => {
    expect(
      resolveDockerCodexAuthContract({
        OPENAI_API_KEY: "test-openai-api-key"
      })
    ).toEqual({
      mode: "openai_api_key",
      mount: null,
      launchEnv: {
        OPENAI_API_KEY: "test-openai-api-key"
      },
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
});
