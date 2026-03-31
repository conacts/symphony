import { describe, expect, it } from "vitest";
import {
  buildSymphonyRuntimeEnvironmentSource,
  loadSymphonyRuntimeAppEnv
} from "./core/env.js";
import { buildSymphonyRuntimeEnv } from "./test-support/build-symphony-runtime-env.js";
import { describeSymphonyRuntimeApp } from "./index.js";

describe("@symphony/runtime scaffold", () => {
  it("keeps env reads at the app boundary", () => {
    const runtime = describeSymphonyRuntimeApp(
      loadSymphonyRuntimeAppEnv(buildSymphonyRuntimeEnv())
    );

    expect(runtime.packageName).toBe("@symphony/runtime");
    expect(runtime.env.port).toBe(4_500);
    expect(runtime.env.workflowPath).toBe("/tmp/WORKFLOW.md");
    expect(runtime.env.runJournalFile).toBe("/tmp/run-journal.json");
    expect(runtime.env.linearApiKey).toBe("test-linear-api-key");
    expect(runtime.dependsOn).toEqual([
      "@symphony/core",
      "@symphony/contracts"
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
      LINEAR_API_KEY: "test-linear-api-key"
    });
  });
});
