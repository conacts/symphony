import {
  resolveSymphonyRuntimeEnvBundle,
  type SymphonyLoadedRuntimeManifest,
  type SymphonyResolvedRuntimeService
} from "@symphony/runtime-contract";
import type { PreparedWorkspace } from "./workspace-contracts.js";

export function resolveDockerWorkspaceEnvBundle(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest | null;
  environmentSource: Record<string, string | undefined> | undefined;
  issueIdentifier: string;
  workspaceKey: string;
  workspacePath: string;
  runId: string | null;
  issueId: string | null;
  services: Record<string, SymphonyResolvedRuntimeService>;
}): PreparedWorkspace["envBundle"] {
  if (!input.runtimeManifest) {
    return applyDockerWorkspaceRuntimeEnvDefaults(
      buildAmbientDockerWorkspaceEnvBundle(input.environmentSource)
    );
  }

  return applyDockerWorkspaceRuntimeEnvDefaults(
    resolveSymphonyRuntimeEnvBundle({
      manifest: input.runtimeManifest.manifest,
      environmentSource: input.environmentSource ?? {},
      runtime: {
        issueId: input.issueId,
        issueIdentifier: input.issueIdentifier,
        runId: input.runId,
        workspaceKey: input.workspaceKey,
        workspacePath: input.workspacePath,
        backendKind: "docker"
      },
      services: input.services,
      manifestPath: input.runtimeManifest.manifestPath
    })
  );
}

function applyDockerWorkspaceRuntimeEnvDefaults(
  envBundle: PreparedWorkspace["envBundle"]
): PreparedWorkspace["envBundle"] {
  if (envBundle.values.NODE_OPTIONS) {
    return envBundle;
  }

  return {
    ...envBundle,
    values: {
      ...envBundle.values,
      NODE_OPTIONS: "--max-old-space-size=2048"
    }
  };
}

function buildAmbientDockerWorkspaceEnvBundle(
  environmentSource: Record<string, string | undefined> | undefined
): PreparedWorkspace["envBundle"] {
  const values = Object.fromEntries(
    Object.entries(environmentSource ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );

  return {
    source: "ambient",
    values,
    summary: {
      source: "ambient",
      injectedKeys: Object.keys(values).sort(),
      requiredHostKeys: [],
      optionalHostKeys: [],
      repoEnvPath: null,
      projectedRepoKeys: [],
      requiredRepoKeys: [],
      optionalRepoKeys: [],
      staticBindingKeys: [],
      runtimeBindingKeys: [],
      serviceBindingKeys: []
    }
  };
}
