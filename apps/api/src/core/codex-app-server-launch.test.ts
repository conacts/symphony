import { describe, expect, it } from "vitest";
import {
  buildCodexAppServerSpawnSpec,
  resolveCodexSdkLaunchSettings
} from "./codex-app-server-launch.js";

describe("codex app server launch", () => {
  it("preserves docker transport env for container launches", () => {
    const spec = buildCodexAppServerSpawnSpec({
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/workspace",
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

  it("extracts the SDK executable while preserving label-based model overrides", () => {
    const settings = resolveCodexSdkLaunchSettings(
      "/tmp/fake-codex app-server --model gpt-5.4",
      {
        id: "issue-1",
        identifier: "COL-1",
        title: "Test issue",
        description: null,
        priority: null,
        url: null,
        state: "Todo",
        branchName: null,
        labels: ["symphony:model:gpt-5.3-codex-spark", "symphony:reasoning:high"],
        projectId: null,
        projectName: null,
        projectSlug: null,
        teamKey: null,
        assigneeId: null,
        blockedBy: [],
        assignedToWorker: false,
        createdAt: null,
        updatedAt: null
      }
    );

    expect(settings).toMatchObject({
      executable: "/tmp/fake-codex",
      model: "gpt-5.3-codex-spark",
      reasoningEffort: "high",
      profile: null,
      providerId: null,
      providerName: null
    });
  });

  it("applies the mimo-v2-pro profile defaults to SDK launches", () => {
    const settings = resolveCodexSdkLaunchSettings(
      "codex",
      {
        id: "issue-1",
        identifier: "COL-1",
        title: "Test issue",
        description: null,
        priority: null,
        url: null,
        state: "Todo",
        branchName: null,
        labels: [],
        projectId: null,
        projectName: null,
        projectSlug: null,
        teamKey: null,
        assigneeId: null,
        blockedBy: [],
        assignedToWorker: false,
        createdAt: null,
        updatedAt: null
      },
      {
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "high",
        profile: "mimo-v2-pro",
        providerId: "openrouter",
        providerName: "OpenRouter"
      }
    );

    expect(settings).toMatchObject({
      executable: "codex",
      model: "xiaomi/mimo-v2-pro",
      reasoningEffort: "high",
      profile: "mimo-v2-pro",
      providerId: "openrouter",
      providerName: "OpenRouter"
    });
  });
});
