import {
  resolveSymphonyRuntimeEnvBundle,
  type SymphonyLoadedRuntimeManifest,
  type SymphonyResolvedRuntimeService
} from "../runtime-manifest.js";
import type {
  PreparedWorkspace,
  WorkspaceBackendKind,
  WorkspaceEnvBundle
} from "./workspace-contracts.js";

export function resolvePreparedWorkspaceEnvBundle(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest | null;
  environmentSource: Record<string, string | undefined> | undefined;
  issueIdentifier: string;
  workspaceKey: string;
  backendKind: WorkspaceBackendKind;
  workspacePath: string;
  issueId: string | null;
  runId: string | null;
  services: Record<string, SymphonyResolvedRuntimeService>;
}): WorkspaceEnvBundle {
  if (!input.runtimeManifest) {
    return buildAmbientWorkspaceEnvBundle(input.environmentSource);
  }

  if (
    input.backendKind === "local" &&
    manifestInjectsProvisionedServiceBindings(input.runtimeManifest)
  ) {
    return buildAmbientWorkspaceEnvBundle(input.environmentSource);
  }

  return resolveSymphonyRuntimeEnvBundle({
    manifest: input.runtimeManifest.manifest,
    repoRoot: input.runtimeManifest.repoRoot,
    environmentSource: input.environmentSource ?? {},
    runtime: {
      issueId: input.issueId,
      issueIdentifier: input.issueIdentifier,
      runId: input.runId,
      workspaceKey: input.workspaceKey,
      workspacePath: input.workspacePath,
      backendKind: input.backendKind
    },
    services: input.services,
    manifestPath: input.runtimeManifest.manifestPath
  });
}

function buildAmbientWorkspaceEnvBundle(
  environmentSource: Record<string, string | undefined> | undefined
): WorkspaceEnvBundle {
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

export function workspaceEnvForHooks(
  workspace: PreparedWorkspace
): Record<string, string> {
  return workspace.envBundle.values;
}

export function workspaceEnvForCleanup(
  workspace: PreparedWorkspace | null | undefined,
  fallbackEnv: Record<string, string | undefined> | undefined
): Record<string, string | undefined> | undefined {
  return workspace ? workspace.envBundle.values : fallbackEnv;
}

function manifestInjectsProvisionedServiceBindings(
  runtimeManifest: SymphonyLoadedRuntimeManifest
): boolean {
  return Object.values(runtimeManifest.manifest.env.inject).some(
    (binding) => binding.kind === "service"
  );
}
