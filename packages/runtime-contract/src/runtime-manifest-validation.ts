import {
  defaultSymphonyRuntimeWorkingDirectory,
  type SymphonyNormalizedRuntimeManifest,
  type SymphonyRuntimePiPresetName,
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
  linearKeys,
  manifestTopLevelKeys,
  piAuthModes,
  piKeys,
  piPresetNames,
  piPresetKeys,
  piReasoningLevels,
  environmentVariablePattern,
  repositoryKeyPattern,
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
  const repositoryKey = parseRepositoryKey(record.repositoryKey, issues);
  const linear = parseLinearBinding(record.linear, issues);
  const workspace = parseWorkspace(record.workspace, issues);
  const services = parseServices(record.services, issues);
  const pi = parsePi(record.pi, issues);
  const env = parseEnv(record.env, issues);
  const lifecycle = parseLifecycle(record.lifecycle, issues);

  validateUniqueServiceHostnames(services.normalized, issues);
  if (env) {
    validateServiceReferences(env.inject, services.declaredKeys, issues);
  }

  if (!schemaVersion || !repositoryKey || !linear || !workspace || !env || !lifecycle) {
    return undefined;
  }

  return {
    schemaVersion,
    repositoryKey,
    linear,
    workspace,
    services: services.normalized,
    pi,
    env,
    lifecycle
  };
}

function parseLinearBinding(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyNormalizedRuntimeManifest["linear"] | undefined {
  if (value === undefined) {
    pushIssue(
      issues,
      ["linear"],
      "linear must declare projectSlug or teamKey."
    );
    return undefined;
  }

  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(value, ["linear"], issues, "linear");

  if (!record) {
    return undefined;
  }

  rejectUnknownKeys(record, linearKeys, ["linear"], issues);
  const projectSlug = readOptionalString(
    record,
    "projectSlug",
    ["linear", "projectSlug"],
    issues,
    "linear.projectSlug"
  );
  const teamKey = readOptionalString(
    record,
    "teamKey",
    ["linear", "teamKey"],
    issues,
    "linear.teamKey"
  );
  const apiKeyEnvKey = readOptionalString(
    record,
    "apiKeyEnvKey",
    ["linear", "apiKeyEnvKey"],
    issues,
    "linear.apiKeyEnvKey"
  );

  if (projectSlug && teamKey) {
    pushIssue(
      issues,
      ["linear"],
      "linear must declare either projectSlug or teamKey, not both."
    );
    return undefined;
  }

  if (!projectSlug && !teamKey) {
    pushIssue(
      issues,
      ["linear"],
      "linear must declare projectSlug or teamKey."
    );
    return undefined;
  }

  if (apiKeyEnvKey && !environmentVariablePattern.test(apiKeyEnvKey)) {
    pushIssue(
      issues,
      ["linear", "apiKeyEnvKey"],
      "linear.apiKeyEnvKey must use an environment variable name like LINEAR_API_KEY_SYM."
    );
    return undefined;
  }

  if (hasIssuesSince(issues, checkpoint)) {
    return undefined;
  }

  return {
    projectSlug: projectSlug ?? null,
    teamKey: teamKey ?? null,
    apiKeyEnvKey: apiKeyEnvKey ?? null
  };
}

function parseRepositoryKey(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): string | undefined {
  const record = {
    repositoryKey: value
  };
  const repositoryKey = readRequiredString(
    record,
    "repositoryKey",
    ["repositoryKey"],
    issues,
    "repositoryKey"
  );

  if (!repositoryKey) {
    return undefined;
  }

  if (!repositoryKeyPattern.test(repositoryKey)) {
    pushIssue(
      issues,
      ["repositoryKey"],
      "repositoryKey must use the <owner>/<repo> format."
    );
    return undefined;
  }

  return repositoryKey;
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
    defaultPreset: defaultPreset as SymphonyRuntimePiPresetName,
    presets
  };
}

function parsePiPresets(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): NonNullable<SymphonyNormalizedRuntimeManifest["pi"]>["presets"] | undefined {
  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(value, ["pi", "presets"], issues, "pi.presets");

  if (!record) {
    return undefined;
  }

  const entries = Object.entries(record);
  const declaredPresetNames = new Set(entries.map(([presetName]) => presetName));

  for (const presetName of piPresetNames) {
    if (!declaredPresetNames.has(presetName)) {
      pushIssue(
        issues,
        ["pi", "presets", presetName],
        `pi.presets must declare the ${presetName} preset.`
      );
    }
  }

  for (const presetName of declaredPresetNames) {
    if (!piPresetNames.has(presetName)) {
      pushIssue(
        issues,
        ["pi", "presets", presetName],
        "Unknown preset key. Expected basic, advanced, or premium."
      );
    }
  }

  if (hasIssuesSince(issues, checkpoint)) {
    return undefined;
  }

  const normalized = {} as NonNullable<
    SymphonyNormalizedRuntimeManifest["pi"]
  >["presets"];
  for (const [presetName, presetValue] of entries) {
    if (!piPresetNames.has(presetName)) {
      continue;
    }

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
    const authMode = readOptionalString(
      presetRecord,
      "auth",
      [...presetPath, "auth"],
      issues,
      `pi.presets.${presetName}.auth`
    );

    if (reasoningEffort && !piReasoningLevels.has(reasoningEffort)) {
      pushIssue(
        issues,
        [...presetPath, "reasoningEffort"],
        `pi.presets.${presetName}.reasoningEffort must be one of "off", "minimal", "low", "medium", "high", or "xhigh".`
      );
      continue;
    }

    if (authMode && !piAuthModes.has(authMode)) {
      pushIssue(
        issues,
        [...presetPath, "auth"],
        `pi.presets.${presetName}.auth must be either "provider" or "subscription".`
      );
      continue;
    }

    if (!model) {
      continue;
    }

    normalized[presetName as SymphonyRuntimePiPresetName] = {
      model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(authMode
        ? { auth: authMode as "provider" | "subscription" }
        : {})
    };
  }

  return hasIssuesSince(issues, checkpoint) ? undefined : normalized;
}
