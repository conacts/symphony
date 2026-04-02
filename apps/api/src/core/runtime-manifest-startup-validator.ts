import {
  loadSymphonyRuntimeManifest,
  resolveSymphonyRuntimeHostEnv,
  resolveSymphonyRuntimeRepoEnv,
  type SymphonyLoadedRuntimeManifest,
  type SymphonyRuntimeEnvironmentSource
} from "@symphony/core/runtime-manifest";

export type SymphonySourceRepoRuntimeManifestSummary = {
  sourceRepo: string;
  manifestPath: string;
  schemaVersion: 1;
  serviceCount: number;
  injectedEnvCount: number;
  requiredHostEnv: string[];
  optionalHostEnv: string[];
  repoEnvPath: string | null;
  projectedRepoEnv: string[];
  requiredRepoEnv: string[];
  optionalRepoEnv: string[];
};

export type SymphonyValidatedSourceRepoRuntimeManifest = {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  summary: SymphonySourceRepoRuntimeManifestSummary;
};

export async function validateSourceRepoRuntimeManifest(
  sourceRepo: string,
  environmentSource: SymphonyRuntimeEnvironmentSource,
  options: {
    resolveRepoEnv?: boolean;
  } = {}
): Promise<SymphonyValidatedSourceRepoRuntimeManifest> {
  const runtimeManifest = await loadSymphonyRuntimeManifest({
    repoRoot: sourceRepo
  });
  const resolvedHostEnv = resolveSymphonyRuntimeHostEnv({
    manifest: runtimeManifest.manifest,
    environmentSource,
    manifestPath: runtimeManifest.manifestPath
  });
  const resolvedRepoEnv = options.resolveRepoEnv
    ? resolveSymphonyRuntimeRepoEnv({
        manifest: runtimeManifest.manifest,
        repoRoot: sourceRepo,
        manifestPath: runtimeManifest.manifestPath
      })
    : null;

  return {
    runtimeManifest,
    summary: {
      sourceRepo,
      manifestPath: runtimeManifest.manifestPath,
      schemaVersion: runtimeManifest.manifest.schemaVersion,
      serviceCount: Object.keys(runtimeManifest.manifest.services).length,
      injectedEnvCount: Object.keys(runtimeManifest.manifest.env.inject).length,
      requiredHostEnv: Object.keys(resolvedHostEnv.required),
      optionalHostEnv: Object.keys(resolvedHostEnv.optional),
      repoEnvPath: resolvedRepoEnv?.path ?? null,
      projectedRepoEnv: Object.keys(resolvedRepoEnv?.projected ?? {}),
      requiredRepoEnv: Object.keys(resolvedRepoEnv?.required ?? {}),
      optionalRepoEnv: Object.keys(resolvedRepoEnv?.optional ?? {})
    }
  };
}
