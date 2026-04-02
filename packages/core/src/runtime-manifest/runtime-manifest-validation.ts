import {
  defaultSymphonyRuntimeWorkingDirectory,
  type SymphonyNormalizedRuntimeManifest,
  type SymphonyRuntimeManifest,
  type SymphonyRuntimeManifestValidationOptions
} from "./runtime-manifest-contract.js";
import {
  createManifestValidationError,
  SymphonyRuntimeManifestError,
  type SymphonyRuntimeManifestIssue
} from "./runtime-manifest-errors.js";
import {
  parseEnv,
  validateServiceReferences,
  validateUniqueServiceHostnames
} from "./runtime-manifest-validation-env.js";
import {
  hasIssuesSince,
  pushIssue,
  rejectUnknownKeys,
  startIssueCheckpoint
} from "./runtime-manifest-validation-issues.js";
import { parseLifecycle } from "./runtime-manifest-validation-lifecycle.js";
import {
  readOptionalRelativePath,
  readRequiredEnum,
  readStrictRecord
} from "./runtime-manifest-validation-readers.js";
import { parseServices } from "./runtime-manifest-validation-services.js";
import {
  manifestTopLevelKeys,
  symphonyRuntimeManifestBrand,
  workspaceKeys,
  workspacePackageManagers
} from "./runtime-manifest-validation-shared.js";
import { isRecord } from "../internal/records.js";
type BrandedSymphonyRuntimeManifest = SymphonyNormalizedRuntimeManifest & {
  readonly [symphonyRuntimeManifestBrand]: true;
};

export function defineSymphonyRuntime(
  input: SymphonyRuntimeManifest
): SymphonyNormalizedRuntimeManifest {
  return brandSymphonyRuntimeManifest(normalizeSymphonyRuntimeManifest(input));
}

export function normalizeSymphonyRuntimeManifest(
  input: unknown,
  options: SymphonyRuntimeManifestValidationOptions = {}
): SymphonyNormalizedRuntimeManifest {
  const issues: SymphonyRuntimeManifestIssue[] = [];
  const manifest = parseRuntimeManifest(input, issues);

  if (!manifest || issues.length > 0) {
    throw createManifestValidationError(issues, options.manifestPath ?? null);
  }

  return manifest;
}

export function validateSymphonyRuntimeManifest(
  input: unknown,
  options: SymphonyRuntimeManifestValidationOptions = {}
): SymphonyNormalizedRuntimeManifest {
  return normalizeSymphonyRuntimeManifest(input, options);
}

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

function parseRuntimeManifest(
  input: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyNormalizedRuntimeManifest | undefined {
  const record = readStrictRecord(input, [], issues, "runtime manifest");

  if (!record) {
    return undefined;
  }

  rejectUnknownKeys(record, manifestTopLevelKeys, [], issues);

  const schemaVersion = parseSchemaVersion(record.schemaVersion, issues);
  const workspace = parseWorkspace(record.workspace, issues);
  const services = parseServices(record.services, issues);
  const env = parseEnv(record.env, issues);
  const lifecycle = parseLifecycle(record.lifecycle, issues);

  validateUniqueServiceHostnames(services.normalized, issues);
  if (env) {
    validateServiceReferences(env.inject, services.declaredKeys, issues);
  }

  if (!schemaVersion || !workspace || !env || !lifecycle) {
    return undefined;
  }

  return {
    schemaVersion,
    workspace,
    services: services.normalized,
    env,
    lifecycle
  };
}

function parseSchemaVersion(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): 1 | undefined {
  if (value !== 1) {
    pushIssue(
      issues,
      ["schemaVersion"],
      "schemaVersion must be the literal value 1."
    );
    return undefined;
  }

  return 1;
}

function parseWorkspace(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyNormalizedRuntimeManifest["workspace"] | undefined {
  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(value, ["workspace"], issues, "workspace");

  if (!record) {
    return undefined;
  }

  rejectUnknownKeys(record, workspaceKeys, ["workspace"], issues);

  const packageManager = readRequiredEnum(
    record,
    "packageManager",
    workspacePackageManagers,
    ["workspace", "packageManager"],
    issues,
    "workspace.packageManager"
  );
  const workingDirectory =
    readOptionalRelativePath(
      record,
      "workingDirectory",
      ["workspace", "workingDirectory"],
      issues,
      "workspace.workingDirectory"
    ) ?? defaultSymphonyRuntimeWorkingDirectory;

  if (!packageManager || hasIssuesSince(issues, checkpoint)) {
    return undefined;
  }

  return {
    packageManager,
    workingDirectory
  };
}

function brandSymphonyRuntimeManifest(
  manifest: SymphonyNormalizedRuntimeManifest
): SymphonyNormalizedRuntimeManifest {
  Object.defineProperty(manifest, symphonyRuntimeManifestBrand, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  return deepFreeze(manifest);
}

function isDefinedSymphonyRuntimeManifest(
  value: unknown
): value is BrandedSymphonyRuntimeManifest {
  if (!isRecord(value)) {
    return false;
  }

  const brandedValue = value as Record<PropertyKey, unknown>;
  return brandedValue[symphonyRuntimeManifestBrand] === true;
}

function deepFreeze<T>(value: T): T {
  if (!isFreezable(value)) {
    return value;
  }

  const record = value as Record<PropertyKey, unknown>;
  for (const property of Reflect.ownKeys(value)) {
    const nestedValue = record[property];
    if (isFreezable(nestedValue)) {
      deepFreeze(nestedValue);
    }
  }

  return Object.freeze(value);
}

function isFreezable(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  );
}
