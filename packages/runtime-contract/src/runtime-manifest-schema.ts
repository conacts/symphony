export const currentSymphonyRuntimeManifestSchemaVersion = 1 as const;

export const supportedSymphonyRuntimeManifestSchemaVersions = [
  currentSymphonyRuntimeManifestSchemaVersion
] as const;

export type SymphonyRuntimeManifestSchemaVersion =
  (typeof supportedSymphonyRuntimeManifestSchemaVersions)[number];

export type SymphonyRuntimeManifestSchemaCompatibility = {
  value: unknown;
  supported: boolean;
  supportedVersions: readonly SymphonyRuntimeManifestSchemaVersion[];
  message: string;
};

export function isSymphonyRuntimeManifestSchemaVersion(
  value: unknown
): value is SymphonyRuntimeManifestSchemaVersion {
  return supportedSymphonyRuntimeManifestSchemaVersions.includes(
    value as SymphonyRuntimeManifestSchemaVersion
  );
}

export function normalizeSymphonyRuntimeManifestSchemaVersion(
  value: unknown
): SymphonyRuntimeManifestSchemaVersion | undefined {
  return isSymphonyRuntimeManifestSchemaVersion(value) ? value : undefined;
}

export function describeSymphonyRuntimeManifestSchemaCompatibility(
  value: unknown
): SymphonyRuntimeManifestSchemaCompatibility {
  if (isSymphonyRuntimeManifestSchemaVersion(value)) {
    return {
      value,
      supported: true,
      supportedVersions: supportedSymphonyRuntimeManifestSchemaVersions,
      message: `schemaVersion ${value} is supported.`
    };
  }

  return {
    value,
    supported: false,
    supportedVersions: supportedSymphonyRuntimeManifestSchemaVersions,
    message:
      value === undefined
        ? `schemaVersion is required. Supported schema versions: ${formatSupportedSchemaVersions()}.`
        : `Unsupported schemaVersion ${JSON.stringify(value)}. Supported schema versions: ${formatSupportedSchemaVersions()}.`
  };
}

function formatSupportedSchemaVersions(): string {
  return supportedSymphonyRuntimeManifestSchemaVersions.join(", ");
}
