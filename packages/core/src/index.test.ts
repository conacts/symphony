import { describe, expect, it } from "vitest";
import { SYMPHONY_CORE_PACKAGE_NAME } from "./index.js";
import { buildSymphonyRepositoryTarget } from "./test-support/build-symphony-repository-target.js";
import { buildSymphonyRuntimeConfig } from "./test-support/build-symphony-runtime-config.js";
import { buildSymphonyWorkflowConfig } from "./test-support/build-symphony-workflow-config.js";
import { buildSymphonyTrackerIssue } from "./test-support/build-symphony-tracker-issue.js";

describe("@symphony/core scaffold", () => {
  it("exposes the extraction-ready package name", () => {
    expect(SYMPHONY_CORE_PACKAGE_NAME).toBe("@symphony/core");
  });

  it("ships deterministic local builders for future boundary tests", () => {
    const repositoryTarget = buildSymphonyRepositoryTarget({
      slug: "symphony"
    });
    const runtimeConfig = buildSymphonyRuntimeConfig({
      repositoryTarget
    });

    expect(runtimeConfig.repositoryTarget.slug).toBe("symphony");
    expect(runtimeConfig.pollIntervalMs).toBe(5_000);
    expect(runtimeConfig.realtimeEnabled).toBe(true);
  });

  it("ships deterministic builders for workflow and tracker core modules", () => {
    const workflowConfig = buildSymphonyWorkflowConfig();
    const issue = buildSymphonyTrackerIssue();

    expect(workflowConfig.tracker.projectSlug).toBe("coldets");
    expect(issue.identifier).toBe("COL-123");
  });
});
