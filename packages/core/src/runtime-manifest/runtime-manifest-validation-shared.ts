import type {
  SymphonyRuntimeBindingValue,
  SymphonyRuntimeServiceBindingValue,
  SymphonyRuntimeWorkspacePackageManager
} from "./runtime-manifest-contract.js";

export const symphonyRuntimeManifestBrand = Symbol.for(
  "@symphony/core/runtime-manifest/defined"
);

export const manifestTopLevelKeys = new Set([
  "schemaVersion",
  "workspace",
  "services",
  "env",
  "lifecycle"
]);

export const workspaceKeys = new Set(["packageManager", "workingDirectory"]);
export const lifecycleKeys = new Set([
  "bootstrap",
  "migrate",
  "verify",
  "seed",
  "cleanup"
]);
export const stepKeys = new Set(["name", "run", "cwd", "timeoutMs"]);
export const envKeys = new Set(["host", "repo", "inject"]);
export const envHostKeys = new Set(["required", "optional"]);
export const envRepoKeys = new Set(["path", "required", "optional"]);
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

export const workspacePackageManagers = new Set<SymphonyRuntimeWorkspacePackageManager>([
  "pnpm",
  "npm",
  "yarn",
  "bun"
]);

export const serviceBindingValues = new Set<SymphonyRuntimeServiceBindingValue>([
  "connectionString",
  "host",
  "port",
  "database",
  "username",
  "password"
]);

export const runtimeBindingValues = new Set<SymphonyRuntimeBindingValue>([
  "issueId",
  "issueIdentifier",
  "runId",
  "workspaceKey",
  "workspacePath",
  "backendKind"
]);

export type ManifestPathSegment = string | number;
export type ManifestPath = ManifestPathSegment[];
