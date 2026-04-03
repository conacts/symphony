import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createTempSymphonySqliteHarness,
  renderSymphonyRuntimeManifestSource
} from "@symphony/test-support";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import type { SymphonyRuntimeAppEnv } from "../core/env.js";
import { loadDefaultSymphonyRuntimeAppServices } from "../core/runtime-services.js";
import type { SymphonyRuntimeAppServices } from "../core/runtime-app-types.js";
import { loadSymphonyRuntimePolicyConfig } from "../core/runtime-policy-config.js";

export type SymphonyRuntimeAppServicesHarness = {
  cleanup(): Promise<void>;
  root: string;
  promptPath: string;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
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
} = {}): Promise<SymphonyRuntimeAppServicesHarness> {
  const sqlite = await createTempSymphonySqliteHarness({
    rootPrefix: input.rootPrefix ?? "symphony-runtime-services-"
  });
  const root = sqlite.root;
  const workspaceRoot = path.join(root, "workspaces");
  const sourceRepo = path.join(root, "source-repo");
  const promptPath = path.join(sourceRepo, ".symphony", "prompt.md");
  let services: SymphonyRuntimeAppServices | null = null;

  try {
    await mkdir(workspaceRoot, {
      recursive: true
    });

    const env = {
      port: 4_400,
      dbFile: sqlite.dbFile,
      sourceRepo,
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
      await writeFile(promptPath, `${input.promptTemplate ?? "Prompt body"}\n`);

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
      SYMPHONY_TRACKER_KIND: "memory",
      SYMPHONY_WORKSPACE_ROOT: workspaceRoot,
      SYMPHONY_POLL_INTERVAL_MS: "50",
      SYMPHONY_GITHUB_REPOSITORY: "openai/symphony",
      SYMPHONY_GITHUB_WEBHOOK_SECRET: "secret",
      SYMPHONY_GITHUB_ALLOWED_REVIEW_LOGINS: "reviewer",
      SYMPHONY_GITHUB_ALLOWED_REWORK_LOGINS: "reviewer",
      ...input.environmentSource
    };
    const runtimePolicy = loadSymphonyRuntimePolicyConfig({
      environmentSource,
      cwd: root
    });
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
      promptPath,
      runtimePolicy,
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
