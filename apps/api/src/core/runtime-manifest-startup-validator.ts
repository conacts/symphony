import {
  loadSymphonyRuntimeManifest,
  resolveSymphonyRuntimeHostEnv,
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
};

export type SymphonyValidatedSourceRepoRuntimeManifest = {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  summary: SymphonySourceRepoRuntimeManifestSummary;
};

export async function validateSourceRepoRuntimeManifest(
  sourceRepo: string,
  environmentSource: SymphonyRuntimeEnvironmentSource
): Promise<SymphonyValidatedSourceRepoRuntimeManifest> {
  const runtimeManifest = await loadSymphonyRuntimeManifest({
    repoRoot: sourceRepo
  });
  const resolvedHostEnv = resolveSymphonyRuntimeHostEnv({
    manifest: runtimeManifest.manifest,
    environmentSource,
    manifestPath: runtimeManifest.manifestPath
  });

  return {
    runtimeManifest,
    summary: {
      sourceRepo,
      manifestPath: runtimeManifest.manifestPath,
      schemaVersion: runtimeManifest.manifest.schemaVersion,
      serviceCount: Object.keys(runtimeManifest.manifest.services).length,
      injectedEnvCount: Object.keys(runtimeManifest.manifest.env.inject).length,
      requiredHostEnv: Object.keys(resolvedHostEnv.required),
      optionalHostEnv: Object.keys(resolvedHostEnv.optional)
    }
  };
}
