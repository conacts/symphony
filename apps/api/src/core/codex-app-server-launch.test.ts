import { describe, expect, it } from "vitest";
import { buildCodexAppServerSpawnSpec } from "./codex-app-server-launch.js";

describe("codex app server launch", () => {
  it("preserves host-side runtime env for local launches while letting explicit bindings win", () => {
    const spec = buildCodexAppServerSpawnSpec({
      launchTarget: {
        kind: "host_path",
        hostWorkspacePath: "/tmp/workspace",
        runtimeWorkspacePath: "/tmp/workspace"
      },
      command: "codex app-server",
      env: {
        OPENAI_API_KEY: "explicit-openai-key"
      },
      hostCommandEnvSource: {
        PATH: "/usr/bin",
        CODEX_HOME: "/tmp/codex-home",
        OPENAI_API_KEY: "host-openai-key"
      }
    });

    expect(spec.env).toMatchObject({
      PATH: "/usr/bin",
      CODEX_HOME: "/tmp/codex-home",
      OPENAI_API_KEY: "explicit-openai-key"
    });
  });

  it("preserves docker transport env for container launches", () => {
    const spec = buildCodexAppServerSpawnSpec({
      launchTarget: {
        kind: "container",
        hostWorkspacePath: "/tmp/workspace",
        runtimeWorkspacePath: "/home/agent/workspace",
        containerId: "container-123",
        containerName: "symphony-col-123",
        shell: "sh"
      },
      command: "codex app-server",
      env: {
        OPENAI_API_KEY: "explicit-openai-key"
      },
      hostCommandEnvSource: {
        PATH: "/usr/bin",
        HOME: "/tmp/home",
        DOCKER_HOST: "unix:///tmp/docker.sock",
        DOCKER_CONTEXT: "colima",
        CODEX_HOME: "/tmp/codex-home"
      }
    });

    expect(spec.env).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/tmp/home",
      DOCKER_HOST: "unix:///tmp/docker.sock",
      DOCKER_CONTEXT: "colima",
      CODEX_HOME: "/tmp/codex-home"
    });
    expect(spec.args).toContain("--env");
    expect(spec.args).toContain("OPENAI_API_KEY=explicit-openai-key");
  });
});
