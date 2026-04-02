import type { SymphonyNormalizedRuntimeManifest } from "./runtime-manifest-contract.js";
import {
  SymphonyRuntimeManifestError
} from "./runtime-manifest-errors.js";
import {
  isDefinedSymphonyRuntimeManifest
} from "./runtime-manifest-validation-branding.js";

export function extractDefinedRuntimeManifest(
  moduleNamespace: Record<string, unknown>,
  manifestPath: string
): SymphonyNormalizedRuntimeManifest {
  if (!("default" in moduleNamespace)) {
    throw new SymphonyRuntimeManifestError(
      "invalid_runtime_manifest_export",
      `Invalid Symphony runtime manifest export at ${manifestPath}: the module must default export defineSymphonyRuntime(...).`,
      {
        manifestPath
      }
    );
  }

  if (!isDefinedSymphonyRuntimeManifest(moduleNamespace.default)) {
    throw new SymphonyRuntimeManifestError(
      "invalid_runtime_manifest_export",
      `Invalid Symphony runtime manifest export at ${manifestPath}: the default export must be the result of defineSymphonyRuntime(...).`,
      {
        manifestPath
      }
    );
  }

  return moduleNamespace.default;
}
