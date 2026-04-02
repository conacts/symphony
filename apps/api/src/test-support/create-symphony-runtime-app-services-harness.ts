import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSymphonyWorkflowConfig,
  createTempSymphonySqliteHarness,
  renderSymphonyRuntimeManifestSource,
  renderSymphonyWorkflowMarkdown
} from "@symphony/test-support";
import type { SymphonyResolvedWorkflowConfig } from "@symphony/core";
import type { SymphonyRuntimeAppEnv } from "../core/env.js";
import {
  loadDefaultSymphonyRuntimeAppServices,
  type SymphonyRuntimeAppServices
} from "../core/runtime-services.js";

export type SymphonyRuntimeAppServicesHarness = {
  cleanup(): Promise<void>;
  root: string;
  workflowPath: string;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  env: SymphonyRuntimeAppEnv;
  environmentSource: Record<string, string | undefined>;
  hostCommandEnvSource: Record<string, string | undefined>;
  services: SymphonyRuntimeAppServices;
};

export async function createSymphonyRuntimeAppServicesHarness(input: {
  env?: Partial<SymphonyRuntimeAppEnv>;
  environmentSource?: Record<string, string | undefined>;
  hostCommandEnvSource?: Record<string, string | undefined>;
  promptTemplate?: string;
  rootPrefix?: string;
  runtimeManifestSource?: string | null;
  workflowConfig?: Partial<SymphonyResolvedWorkflowConfig>;
} = {}): Promise<SymphonyRuntimeAppServicesHarness> {
  const sqlite = await createTempSymphonySqliteHarness({
    rootPrefix: input.rootPrefix ?? "symphony-runtime-services-"
  });
  const root = sqlite.root;
  const workspaceRoot = path.join(root, "workspaces");
  const sourceRepo = path.join(root, "source-repo");
  const workflowPath = path.join(root, "WORKFLOW.md");
  let services: SymphonyRuntimeAppServices | null = null;

  try {
    await mkdir(workspaceRoot, {
      recursive: true
    });

    const baseWorkflowConfig = buildSymphonyWorkflowConfig();
    const workflowConfig = {
      ...baseWorkflowConfig,
      tracker: {
        ...baseWorkflowConfig.tracker,
        kind: "memory" as const,
        apiKey: null,
        projectSlug: null,
        teamKey: null,
        ...input.workflowConfig?.tracker
      },
      polling: {
        ...baseWorkflowConfig.polling,
        intervalMs: 50,
        ...input.workflowConfig?.polling
      },
      workspace: {
        ...baseWorkflowConfig.workspace,
        root: workspaceRoot,
        ...input.workflowConfig?.workspace
      },
      worker: {
        ...baseWorkflowConfig.worker,
        ...input.workflowConfig?.worker
      },
      agent: {
        ...baseWorkflowConfig.agent,
        ...input.workflowConfig?.agent
      },
      codex: {
        ...baseWorkflowConfig.codex,
        ...input.workflowConfig?.codex
      },
      hooks: {
        ...baseWorkflowConfig.hooks,
        ...input.workflowConfig?.hooks
      },
      observability: {
        ...baseWorkflowConfig.observability,
        ...input.workflowConfig?.observability
      },
      server: {
        ...baseWorkflowConfig.server,
        ...input.workflowConfig?.server
      },
      github: {
        ...baseWorkflowConfig.github,
        repo: "openai/symphony",
        webhookSecret: "secret",
        statePath: path.join(root, "github-state.json"),
        allowedReviewLogins: ["reviewer"],
        allowedReworkCommentLogins: ["reviewer"],
        ...input.workflowConfig?.github
      }
    } satisfies SymphonyResolvedWorkflowConfig;

    await writeFile(
      workflowPath,
      renderSymphonyWorkflowMarkdown({
        config: workflowConfig,
        promptTemplate: input.promptTemplate ?? "Prompt body"
      })
    );

    const env = {
      port: 4_400,
      workflowPath,
      dbFile: sqlite.dbFile,
      sourceRepo,
      workspaceBackend: "docker" as const,
      dockerWorkspaceImage: null,
      dockerMaterializationMode: "bind_mount" as const,
      dockerWorkspacePath: null,
      dockerContainerNamePrefix: null,
      dockerShell: null,
      allowedOrigins: [],
      linearApiKey: "test-linear-api-key",
      logLevel: "error",
      ...input.env
    } satisfies SymphonyRuntimeAppEnv;

    if (env.sourceRepo) {
      await mkdir(path.join(env.sourceRepo, ".symphony"), {
        recursive: true
      });

      if (input.runtimeManifestSource !== null) {
        await writeFile(
          path.join(env.sourceRepo, ".symphony", "runtime.ts"),
          input.runtimeManifestSource ?? buildDefaultRuntimeManifestSource()
        );
      }
    }

    const environmentSource = {
      LINEAR_API_KEY: env.linearApiKey,
      SYMPHONY_SOURCE_REPO: env.sourceRepo ?? undefined,
      ...input.environmentSource
    };
    const hostCommandEnvSource = input.hostCommandEnvSource ?? {
      OPENAI_API_KEY: "test-openai-api-key"
    };

    services = await loadDefaultSymphonyRuntimeAppServices(
      env,
      environmentSource,
      hostCommandEnvSource
    );

    let cleaned = false;

    return {
      root,
      workflowPath,
      workflowConfig,
      env,
      environmentSource,
      hostCommandEnvSource,
      services,
      async cleanup() {
        if (cleaned) {
          return;
        }

        cleaned = true;
        await services?.shutdown();
        await rm(root, {
          recursive: true,
          force: true
        });
      }
    };
  } catch (error) {
    if (services) {
      await services.shutdown();
      await rm(root, {
        recursive: true,
        force: true
      });
    } else {
      await sqlite.cleanup();
    }
    throw error;
  }
}

function buildDefaultRuntimeManifestSource(): string {
  return renderSymphonyRuntimeManifestSource();
}
