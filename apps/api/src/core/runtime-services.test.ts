import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCodexAgentRuntime,
  createLocalWorkspaceBackend,
  createSymphonyRuntime
} from "@symphony/core";
import type { SymphonyRuntimeAppEnv } from "./env.js";

vi.mock("@symphony/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@symphony/core")>();

  return {
    ...actual,
    createLocalWorkspaceBackend: vi.fn(actual.createLocalWorkspaceBackend),
    createCodexAgentRuntime: vi.fn(actual.createCodexAgentRuntime),
    createSymphonyRuntime: vi.fn(actual.createSymphonyRuntime)
  };
});

import { loadDefaultSymphonyRuntimeAppServices } from "./runtime-services.js";

const tempRoots: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("runtime services", () => {
  it("loads the default app services through the public core facades", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-services-"));
    tempRoots.push(root);

    const workspaceRoot = path.join(root, "workspaces");
    const sourceRepo = path.join(root, "source-repo");
    const workflowPath = path.join(root, "WORKFLOW.md");
    await mkdir(workspaceRoot, {
      recursive: true
    });
    await mkdir(sourceRepo, {
      recursive: true
    });
    await writeFile(
      workflowPath,
      `---
tracker:
  kind: memory
polling:
  interval_ms: 60000
workspace:
  root: ${workspaceRoot}
---
Prompt body
`
    );

    const env = {
      port: 4_400,
      workflowPath,
      dbFile: path.join(root, "symphony.db"),
      sourceRepo,
      allowedOrigins: [],
      linearApiKey: "test-linear-api-key",
      logLevel: "error"
    } satisfies SymphonyRuntimeAppEnv;
    const environmentSource = {
      LINEAR_API_KEY: env.linearApiKey,
      SYMPHONY_SOURCE_REPO: env.sourceRepo
    };

    const services = await loadDefaultSymphonyRuntimeAppServices(env, environmentSource);

    try {
      const createLocalWorkspaceBackendMock = vi.mocked(
        createLocalWorkspaceBackend
      );
      const createCodexAgentRuntimeMock = vi.mocked(createCodexAgentRuntime);
      const createSymphonyRuntimeMock = vi.mocked(createSymphonyRuntime);

      expect(createLocalWorkspaceBackendMock).toHaveBeenCalledTimes(1);
      expect(createLocalWorkspaceBackendMock).toHaveBeenCalledWith({
        repoOwnedSourceRepo: sourceRepo
      });
      expect(createCodexAgentRuntimeMock).toHaveBeenCalledTimes(1);
      expect(createSymphonyRuntimeMock).toHaveBeenCalledTimes(1);

      expect(createSymphonyRuntimeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowConfig: services.workflowConfig,
          tracker: services.tracker,
          workspaceBackend:
            createLocalWorkspaceBackendMock.mock.results[0]?.value,
          agentRuntime: createCodexAgentRuntimeMock.mock.results[0]?.value,
          runnerEnv: environmentSource,
          observer: expect.any(Object)
        })
      );
      expect(services.workflow.promptTemplate).toBe("Prompt body");
      expect(services.health.snapshot()).toEqual(
        expect.objectContaining({
          healthy: true,
          db: {
            file: env.dbFile,
            ready: true
          }
        })
      );
      await waitFor(() => {
        const poller = services.health.snapshot().poller;
        return poller.lastCompletedAt !== null && poller.inFlight === false;
      });
    } finally {
      await services.shutdown();
    }
  });
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000
): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for runtime services to settle.");
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}
