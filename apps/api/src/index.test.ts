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
});
