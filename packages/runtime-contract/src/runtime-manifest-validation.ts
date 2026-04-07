import {
  defaultSymphonyRuntimeWorkingDirectory,
  type SymphonyNormalizedRuntimeManifest,
  type SymphonyRuntimeManifestValidationOptions
} from "./runtime-manifest-contract.js";
import {
  currentSymphonyRuntimeManifestSchemaVersion,
  describeSymphonyRuntimeManifestSchemaCompatibility,
  normalizeSymphonyRuntimeManifestSchemaVersion
} from "./runtime-manifest-schema.js";
import {
  createManifestValidationError,
  type SymphonyRuntimeManifestIssue
} from "./runtime-manifest-errors.js";
import { parseEnv, validateServiceReferences, validateUniqueServiceHostnames } from "./runtime-manifest-validation-env.js";
import {
  hasIssuesSince,
  pushIssue,
  rejectUnknownKeys,
  startIssueCheckpoint
} from "./runtime-manifest-validation-issues.js";
import { parseLifecycle } from "./runtime-manifest-validation-lifecycle.js";
import {
  readOptionalRelativePath,
  readOptionalString,
  readRequiredString,
  readRequiredEnum,
  readStrictRecord
} from "./runtime-manifest-validation-readers.js";
import { parseServices } from "./runtime-manifest-validation-services.js";
import {
  manifestTopLevelKeys,
  piKeys,
  piPresetKeys,
  piReasoningLevels,
  workspaceKeys,
  workspacePackageManagers
} from "./runtime-manifest-validation-shared.js";
export { defineSymphonyRuntime } from "./runtime-manifest-validation-branding.js";
export { extractDefinedRuntimeManifest } from "./runtime-manifest-validation-export.js";

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
  const pi = parsePi(record.pi, issues);
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
    pi,
    env,
    lifecycle
  };
}

function parseSchemaVersion(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): typeof currentSymphonyRuntimeManifestSchemaVersion | undefined {
  const schemaVersion = normalizeSymphonyRuntimeManifestSchemaVersion(value);
  if (schemaVersion !== undefined) {
    return schemaVersion;
  }

  const compatibility = describeSymphonyRuntimeManifestSchemaCompatibility(value);
  pushIssue(
    issues,
    ["schemaVersion"],
    compatibility.message
  );
  return undefined;
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

function parsePi(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyNormalizedRuntimeManifest["pi"] {
  if (value === undefined) {
    return null;
  }

  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(value, ["pi"], issues, "pi");

  if (!record) {
    return null;
  }

  rejectUnknownKeys(record, piKeys, ["pi"], issues);
  const defaultPreset = readRequiredString(
    record,
    "defaultPreset",
    ["pi", "defaultPreset"],
    issues,
    "pi.defaultPreset"
  );
  const presets = parsePiPresets(record.presets, issues);

  if (!defaultPreset || !presets || hasIssuesSince(issues, checkpoint)) {
    return null;
  }

  if (!(defaultPreset in presets)) {
    pushIssue(
      issues,
      ["pi", "defaultPreset"],
      `pi.defaultPreset must reference one of the declared preset keys (${Object.keys(presets).join(", ")}).`
    );
    return null;
  }

  return {
    defaultPreset,
    presets
  };
}

function parsePiPresets(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): NonNullable<SymphonyNormalizedRuntimeManifest["pi"]>["presets"] | undefined {
  const record = readStrictRecord(value, ["pi", "presets"], issues, "pi.presets");

  if (!record) {
    return undefined;
  }

  const entries = Object.entries(record);
  if (entries.length === 0) {
    pushIssue(issues, ["pi", "presets"], "pi.presets must declare at least one preset.");
    return undefined;
  }

  const normalized: NonNullable<SymphonyNormalizedRuntimeManifest["pi"]>["presets"] = {};
  for (const [presetName, presetValue] of entries) {
    const presetPath = ["pi", "presets", presetName] as const;
    const presetRecord = readStrictRecord(
      presetValue,
      [...presetPath],
      issues,
      `pi.presets.${presetName}`
    );

    if (!presetRecord) {
      continue;
    }

    rejectUnknownKeys(presetRecord, piPresetKeys, [...presetPath], issues);
    const model = readRequiredString(
      presetRecord,
      "model",
      [...presetPath, "model"],
      issues,
      `pi.presets.${presetName}.model`
    );
    const reasoningEffort = readOptionalString(
      presetRecord,
      "reasoningEffort",
      [...presetPath, "reasoningEffort"],
      issues,
      `pi.presets.${presetName}.reasoningEffort`
    );

    if (reasoningEffort && !piReasoningLevels.has(reasoningEffort)) {
      pushIssue(
        issues,
        [...presetPath, "reasoningEffort"],
        `pi.presets.${presetName}.reasoningEffort must be one of "off", "minimal", "low", "medium", "high", or "xhigh".`
      );
      continue;
    }

    if (!model) {
      continue;
    }

    normalized[presetName] = {
      model,
      ...(reasoningEffort ? { reasoningEffort } : {})
    };
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
