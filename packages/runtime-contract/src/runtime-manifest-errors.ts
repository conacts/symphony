export type SymphonyRuntimeManifestIssue = {
  path: string;
  message: string;
};

export type SymphonyRuntimeManifestErrorCode =
  | "missing_runtime_manifest"
  | "invalid_runtime_manifest"
  | "invalid_runtime_manifest_export"
  | "runtime_manifest_load_failed"
  | "runtime_manifest_env_resolution_failed";

export class SymphonyRuntimeManifestError extends Error {
  readonly code: SymphonyRuntimeManifestErrorCode;
  readonly manifestPath: string | null;
  readonly issues: SymphonyRuntimeManifestIssue[];

  constructor(
    code: SymphonyRuntimeManifestErrorCode,
    message: string,
    options: {
      manifestPath?: string | null;
      issues?: SymphonyRuntimeManifestIssue[];
      cause?: unknown;
    } = {}
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "SymphonyRuntimeManifestError";
    this.code = code;
    this.manifestPath = options.manifestPath ?? null;
    this.issues = options.issues ?? [];
  }

  withManifestPath(manifestPath: string): SymphonyRuntimeManifestError {
    if (this.manifestPath === manifestPath) {
      return this;
    }

    return new SymphonyRuntimeManifestError(
      this.code,
      rebuildManifestErrorMessage(this.code, manifestPath, this.issues, this.message),
      {
        manifestPath,
        issues: this.issues,
        cause: this.cause
      }
    );
  }
}

export function createManifestValidationError(
  issues: SymphonyRuntimeManifestIssue[],
  manifestPath: string | null
): SymphonyRuntimeManifestError {
  return new SymphonyRuntimeManifestError(
    "invalid_runtime_manifest",
    rebuildManifestErrorMessage("invalid_runtime_manifest", manifestPath, issues),
    {
      manifestPath,
      issues
    }
  );
}

export function createManifestEnvResolutionError(
  issues: SymphonyRuntimeManifestIssue[],
  manifestPath: string | null
): SymphonyRuntimeManifestError {
  return new SymphonyRuntimeManifestError(
    "runtime_manifest_env_resolution_failed",
    rebuildManifestErrorMessage(
      "runtime_manifest_env_resolution_failed",
      manifestPath,
      issues
    ),
    {
      manifestPath,
      issues
    }
  );
}

function rebuildManifestErrorMessage(
  code: SymphonyRuntimeManifestErrorCode,
  manifestPath: string | null,
  issues: SymphonyRuntimeManifestIssue[],
  fallbackMessage?: string
): string {
  switch (code) {
    case "invalid_runtime_manifest":
      return `Invalid Symphony runtime manifest${manifestPath ? ` at ${manifestPath}` : ""}: ${formatManifestIssues(issues)}.`;
    case "invalid_runtime_manifest_export":
      return `Invalid Symphony runtime manifest export${manifestPath ? ` at ${manifestPath}` : ""}: ${
        issues.length > 0
          ? formatManifestIssues(issues)
          : fallbackMessage ?? "The module must default export defineSymphonyRuntime(...)."
      }`;
    case "missing_runtime_manifest":
      return `Missing Symphony runtime manifest${manifestPath ? `: ${manifestPath}` : "."}`;
    case "runtime_manifest_load_failed":
      return fallbackMessage ?? `Failed to load Symphony runtime manifest${manifestPath ? ` at ${manifestPath}` : ""}.`;
    case "runtime_manifest_env_resolution_failed":
      return `Failed to resolve Symphony runtime manifest environment${
        manifestPath ? ` at ${manifestPath}` : ""
      }: ${formatManifestIssues(issues)}.`;
    default:
      return fallbackMessage ?? "Invalid Symphony runtime manifest.";
  }
}

function formatManifestIssues(issues: SymphonyRuntimeManifestIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}
