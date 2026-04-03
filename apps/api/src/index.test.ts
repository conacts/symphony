import { describe, expect, it } from "vitest";
import { defaultSymphonyDockerWorkspaceImage } from "@symphony/core";
import {
  buildSymphonyHostCommandEnvironmentSource,
  buildSymphonyRuntimeEnvironmentSource,
  loadSymphonyRuntimeAppEnv
} from "./core/env.js";
import { buildSymphonyRuntimeEnv } from "./test-support/build-symphony-runtime-env.js";
import { describeSymphonyRuntimeApp } from "./index.js";

describe("@symphony/api scaffold", () => {
  it("keeps env reads at the app boundary", () => {
    const runtime = describeSymphonyRuntimeApp(
      loadSymphonyRuntimeAppEnv(buildSymphonyRuntimeEnv())
    );

    expect(runtime.packageName).toBe("@symphony/api");
    expect(runtime.env.port).toBe(4_500);
    expect(runtime.env.dbFile).toBe("/tmp/symphony.db");
    expect(runtime.env.sourceRepo).toBe("/tmp/source-repo");
    expect(runtime.env.dockerWorkspaceImage).toBeNull();
    expect(runtime.env.dockerMaterializationMode).toBe("bind_mount");
    expect(runtime.env.dockerWorkspacePath).toBeNull();
    expect(runtime.env.dockerContainerNamePrefix).toBeNull();
    expect(runtime.env.dockerShell).toBeNull();
    expect(runtime.env.allowedOrigins).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ]);
    expect(runtime.env.linearApiKey).toBe("test-linear-api-key");
    expect(runtime.env.logLevel).toBe("debug");
    expect(runtime.dependsOn).toEqual([
      "@symphony/core",
      "@symphony/contracts",
      "@symphony/db",
      "@symphony/logger",
      "@symphony/runtime-contract"
    ]);
  });

  it("requires LINEAR_API_KEY and preserves host env for generic manifest resolution", () => {
    expect(() =>
      loadSymphonyRuntimeAppEnv(buildSymphonyRuntimeEnv({
        LINEAR_API_KEY: ""
      }))
    ).toThrowError(/LINEAR_API_KEY/i);

    const environmentSource = {
      ...buildSymphonyRuntimeEnv(),
      OPENAI_API_KEY: "test-openai-api-key",
      GITHUB_TOKEN: "test-github-token",
      UNRELATED_ENV: "ignore-me"
    };
    const env = loadSymphonyRuntimeAppEnv(environmentSource);

    expect(
      buildSymphonyRuntimeEnvironmentSource(env, environmentSource)
    ).toMatchObject({
      OPENAI_API_KEY: "test-openai-api-key",
      GITHUB_TOKEN: "test-github-token",
      UNRELATED_ENV: "ignore-me",
      LINEAR_API_KEY: "test-linear-api-key",
      SYMPHONY_SOURCE_REPO: "/tmp/source-repo"
    });
    expect(buildSymphonyHostCommandEnvironmentSource(environmentSource)).toEqual({
      OPENAI_API_KEY: "test-openai-api-key",
      GITHUB_TOKEN: "test-github-token"
    });
  });

  it("supports disabling explicit cors origins while preserving an explicit empty list", () => {
    const env = loadSymphonyRuntimeAppEnv(
      buildSymphonyRuntimeEnv({
        SYMPHONY_ALLOWED_ORIGINS: ""
      })
    );

    expect(env.allowedOrigins).toEqual([]);
  });

  it("allows Docker workspace execution to fall back to the supported local image", () => {
    const fallback = loadSymphonyRuntimeAppEnv(
      buildSymphonyRuntimeEnv({
        SYMPHONY_DOCKER_WORKSPACE_IMAGE: undefined
      })
    );

    expect(fallback.dockerWorkspaceImage).toBeNull();

    const env = loadSymphonyRuntimeAppEnv(
      buildSymphonyRuntimeEnv({
        SYMPHONY_DOCKER_WORKSPACE_IMAGE: defaultSymphonyDockerWorkspaceImage,
        SYMPHONY_DOCKER_MATERIALIZATION_MODE: "volume",
        SYMPHONY_DOCKER_WORKSPACE_PATH: "/home/agent/workspace",
        SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX: "symphony-test",
        SYMPHONY_DOCKER_SHELL: "sh"
      })
    );

    expect(env.dockerWorkspaceImage).toBe(defaultSymphonyDockerWorkspaceImage);
    expect(env.dockerMaterializationMode).toBe("volume");
    expect(env.dockerWorkspacePath).toBe("/home/agent/workspace");
    expect(env.dockerContainerNamePrefix).toBe("symphony-test");
    expect(env.dockerShell).toBe("sh");
  });
});
