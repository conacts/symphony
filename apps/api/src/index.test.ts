import { describe, expect, it } from "vitest";
import {
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
    expect(runtime.env.workflowPath).toBe("/tmp/WORKFLOW.md");
    expect(runtime.env.dbFile).toBe("/tmp/symphony.db");
    expect(runtime.env.sourceRepo).toBe("/tmp/source-repo");
    expect(runtime.env.workspaceBackend).toBe("local");
    expect(runtime.env.dockerWorkspaceImage).toBeNull();
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
      "@symphony/logger"
    ]);
  });

  it("requires LINEAR_API_KEY and exports it back to the workflow env bridge", () => {
    expect(() =>
      loadSymphonyRuntimeAppEnv(buildSymphonyRuntimeEnv({
        LINEAR_API_KEY: ""
      }))
    ).toThrowError(/LINEAR_API_KEY/i);

    const env = loadSymphonyRuntimeAppEnv(buildSymphonyRuntimeEnv());

    expect(buildSymphonyRuntimeEnvironmentSource(env)).toEqual({
      LINEAR_API_KEY: "test-linear-api-key",
      SYMPHONY_SOURCE_REPO: "/tmp/source-repo"
    });
  });

  it("supports disabling explicit cors origins and falling back to local-network defaults", () => {
    const env = loadSymphonyRuntimeAppEnv(
      buildSymphonyRuntimeEnv({
        SYMPHONY_ALLOWED_ORIGINS: ""
      })
    );

    expect(env.allowedOrigins).toEqual([]);
  });

  it("requires an explicit Docker image when Docker workspace execution is selected", () => {
    expect(() =>
      loadSymphonyRuntimeAppEnv(
        buildSymphonyRuntimeEnv({
          SYMPHONY_WORKSPACE_BACKEND: "docker",
          SYMPHONY_DOCKER_WORKSPACE_IMAGE: undefined
        })
      )
    ).toThrowError(/SYMPHONY_DOCKER_WORKSPACE_IMAGE/i);

    const env = loadSymphonyRuntimeAppEnv(
      buildSymphonyRuntimeEnv({
        SYMPHONY_WORKSPACE_BACKEND: "docker",
        SYMPHONY_DOCKER_WORKSPACE_IMAGE: "alpine:3.20",
        SYMPHONY_DOCKER_WORKSPACE_PATH: "/home/agent/workspace",
        SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX: "symphony-test",
        SYMPHONY_DOCKER_SHELL: "sh"
      })
    );

    expect(env.workspaceBackend).toBe("docker");
    expect(env.dockerWorkspaceImage).toBe("alpine:3.20");
    expect(env.dockerWorkspacePath).toBe("/home/agent/workspace");
    expect(env.dockerContainerNamePrefix).toBe("symphony-test");
    expect(env.dockerShell).toBe("sh");
  });
});
