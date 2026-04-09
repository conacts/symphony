import type {
  SymphonyRuntimeBindingValue,
  SymphonyRuntimeServiceBindingValue,
  SymphonyRuntimeWorkspacePackageManager
} from "./runtime-manifest-contract.js";

export const symphonyRuntimeManifestBrand = Symbol.for(
  "@symphony/runtime-contract/defined"
);

export const manifestTopLevelKeys = new Set([
  "schemaVersion",
  "repositoryKey",
  "linear",
  "workspace",
  "services",
  "pi",
  "env",
  "lifecycle"
]);

export const linearKeys = new Set(["teamKey"]);
export const workspaceKeys = new Set(["packageManager", "workingDirectory"]);
export const piKeys = new Set(["defaultPreset", "presets"]);
export const piPresetKeys = new Set(["model", "reasoningEffort", "auth"]);
export const lifecycleKeys = new Set([
  "bootstrap",
  "migrate",
  "verify",
  "seed",
  "cleanup"
]);
export const stepKeys = new Set(["name", "run", "cwd", "timeoutMs"]);
export const envKeys = new Set(["host", "inject"]);
export const envHostKeys = new Set(["required", "optional"]);
export const staticBindingKeys = new Set(["kind", "value"]);
export const serviceBindingKeys = new Set(["kind", "service", "value"]);
export const postgresServiceKeys = new Set([
  "type",
  "image",
  "hostname",
  "port",
  "database",
  "username",
  "password",
  "resources",
  "readiness",
  "init"
]);
export const postgresResourceKeys = new Set(["memoryMb", "cpuShares"]);
export const postgresReadinessKeys = new Set(["timeoutMs", "intervalMs", "retries"]);

export const serviceKeyPattern = /^[a-z][a-z0-9-]*$/u;
export const environmentVariablePattern = /^[A-Z][A-Z0-9_]*$/u;
export const repositoryKeyPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u;

export const workspacePackageManagers = new Set<SymphonyRuntimeWorkspacePackageManager>([
  "pnpm",
  "npm",
  "yarn",
  "bun"
]);

export const piReasoningLevels = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
]);

export const piPresetNames = new Set(["basic", "advanced", "premium"]);
export const piAuthModes = new Set(["provider", "subscription"]);

export const serviceBindingValues = new Set<SymphonyRuntimeServiceBindingValue>([
  "connectionString",
  "host",
  "port",
  "database",
  "username",
  "password"
]);

export const runtimeBindingValues = new Set<SymphonyRuntimeBindingValue>([
  "trackerIssueId",
  "issueIdentifier",
  "runId",
  "workspaceKey",
  "workspacePath",
  "backendKind"
]);

export type ManifestPathSegment = string | number;
export type ManifestPath = ManifestPathSegment[];
