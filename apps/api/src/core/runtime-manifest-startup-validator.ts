import { loadSymphonyRuntimeManifest } from "@symphony/core/runtime-manifest";

export type SymphonySourceRepoRuntimeManifestSummary = {
  sourceRepo: string;
  manifestPath: string;
  schemaVersion: 1;
  serviceCount: number;
  injectedEnvCount: number;
};

export async function validateSourceRepoRuntimeManifest(
  sourceRepo: string
): Promise<SymphonySourceRepoRuntimeManifestSummary> {
  const runtimeManifest = await loadSymphonyRuntimeManifest({
    repoRoot: sourceRepo
  });

  return {
    sourceRepo,
    manifestPath: runtimeManifest.manifestPath,
    schemaVersion: runtimeManifest.manifest.schemaVersion,
    serviceCount: Object.keys(runtimeManifest.manifest.services).length,
    injectedEnvCount: Object.keys(runtimeManifest.manifest.env.inject).length
  };
}
