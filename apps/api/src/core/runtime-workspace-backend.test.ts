import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeSymphonyRuntimeManifest } from "@symphony/core/runtime-manifest";
import { createRuntimeWorkspaceBackend } from "./runtime-workspace-backend.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("runtime workspace backend selection", () => {
  it("defaults to the local workspace backend", () => {
    const selection = createRuntimeWorkspaceBackend({
      sourceRepo: "/tmp/source-repo",
      workspaceBackend: "local",
      dockerWorkspaceImage: null,
      dockerWorkspacePath: null,
      dockerContainerNamePrefix: null,
      dockerShell: null
    });

    expect(selection.metadata).toEqual({
      backendKind: "local",
      executionTargetKind: "host_path",
      materializationKind: "directory",
      selectionSource: "env",
      sourceRepo: "/tmp/source-repo",
      manifestPath: null
    });
    expect(selection.backend.prepareWorkspace).toBeTypeOf("function");
  });

  it("creates a docker backend only when explicitly selected", () => {
    const selection = createRuntimeWorkspaceBackend({
      sourceRepo: "/tmp/source-repo",
      workspaceBackend: "docker",
      dockerWorkspaceImage: "alpine:3.20",
      dockerWorkspacePath: "/home/agent/workspace",
      dockerContainerNamePrefix: "symphony-test",
      dockerShell: "sh"
    });

    expect(selection.metadata).toEqual({
      backendKind: "docker",
      executionTargetKind: "container",
      materializationKind: "bind_mount",
      selectionSource: "env",
      image: "alpine:3.20",
      workspacePath: "/home/agent/workspace",
      containerNamePrefix: "symphony-test",
      shell: "sh",
      manifestPath: null
    });
    expect(selection.backend.prepareWorkspace).toBeTypeOf("function");
  });

  it("keeps the local backend on ambient env when a manifest declares service bindings", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-backend-"));
    tempRoots.push(root);

    const selection = createRuntimeWorkspaceBackend(
      {
        sourceRepo: "/tmp/source-repo",
        workspaceBackend: "local",
        dockerWorkspaceImage: null,
        dockerWorkspacePath: null,
        dockerContainerNamePrefix: null,
        dockerShell: null
      },
      {
        runtimeManifest: {
          repoRoot: "/repo",
          manifestPath: "/repo/.symphony/runtime.ts",
          manifest: normalizeSymphonyRuntimeManifest({
            schemaVersion: 1,
            workspace: {
              packageManager: "pnpm"
            },
            services: {
              postgres: {
                type: "postgres",
                image: "postgres:16",
                database: "app",
                username: "app",
                password: "secret"
              }
            },
            env: {
              host: {
                required: [],
                optional: []
              },
              inject: {
                DATABASE_URL: {
                  kind: "service",
                  service: "postgres",
                  value: "connectionString"
                }
              }
            },
            lifecycle: {
              bootstrap: [],
              migrate: [],
              verify: [
                {
                  name: "verify",
                  run: "pnpm test"
                }
              ],
              seed: [],
              cleanup: []
            }
          })
        }
      }
    );

    const workspace = await selection.backend.prepareWorkspace({
      context: {
        issueId: "issue-local-selector",
        issueIdentifier: "COL-LOCAL"
      },
      runId: "run-local-selector",
      config: {
        root
      },
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1_000
      },
      env: {
        OPENAI_API_KEY: "test-openai-key"
      }
    });

    expect(workspace.envBundle.summary.source).toBe("ambient");
    expect(workspace.envBundle.values).toEqual({
      OPENAI_API_KEY: "test-openai-key"
    });
  });
});
