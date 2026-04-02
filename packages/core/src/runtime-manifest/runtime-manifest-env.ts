import fs from "node:fs";
import path from "node:path";
import type {
  SymphonyResolvedRuntimeEnvBundle,
  SymphonyResolvedRuntimeEnvBundleSummary,
  SymphonyResolvedRuntimeHostEnv,
  SymphonyResolvedRuntimeRepoEnv,
  SymphonyResolvedRuntimeService,
  SymphonyRuntimeBindingValue,
  SymphonyRuntimeEnvBinding,
  SymphonyRuntimeEnvResolutionInput,
  SymphonyRuntimeHostEnvResolutionInput,
  SymphonyRuntimeRepoEnvResolutionInput,
  SymphonyRuntimeServiceBindingValue
} from "./runtime-manifest-contract.js";
import {
  createManifestEnvResolutionError,
  type SymphonyRuntimeManifestIssue
} from "./runtime-manifest-errors.js";

export function resolveSymphonyRuntimeHostEnv(
  input: SymphonyRuntimeHostEnvResolutionInput
): SymphonyResolvedRuntimeHostEnv {
  const issues: SymphonyRuntimeManifestIssue[] = [];
  const required: Record<string, string> = {};
  const optional: Record<string, string> = {};

  input.manifest.env.host.required.forEach((name, index) => {
    const value = input.environmentSource[name];

    if (isPresentEnvironmentValue(value)) {
      required[name] = value;
      return;
    }

    issues.push({
      path: `env.host.required[${index}]`,
      message: `Required host environment variable ${name} is missing.`
    });
  });

  input.manifest.env.host.optional.forEach((name) => {
    const value = input.environmentSource[name];

    if (isPresentEnvironmentValue(value)) {
      optional[name] = value;
    }
  });

  if (issues.length > 0) {
    throw createManifestEnvResolutionError(issues, input.manifestPath ?? null);
  }

  return {
    required,
    optional
  };
}

export function resolveSymphonyRuntimeRepoEnv(
  input: SymphonyRuntimeRepoEnvResolutionInput
): SymphonyResolvedRuntimeRepoEnv | null {
  const repoConfig = input.manifest.env.repo;
  if (!repoConfig) {
    return null;
  }

  const issues: SymphonyRuntimeManifestIssue[] = [];
  const resolvedPath = path.resolve(input.repoRoot, repoConfig.path);

  let projected: Record<string, string>;
  try {
    const content = fs.readFileSync(resolvedPath, "utf8");
    projected = parseEnvironmentFile(content);
  } catch (error) {
    issues.push({
      path: "env.repo.path",
      message: `Required repo runtime env snapshot is unavailable at ${resolvedPath}.`
    });
    throw createManifestEnvResolutionError(issues, input.manifestPath ?? null);
  }

  const required: Record<string, string> = {};
  const optional: Record<string, string> = {};

  repoConfig.required.forEach((name, index) => {
    const value = projected[name];

    if (isPresentEnvironmentValue(value)) {
      required[name] = value;
      return;
    }

    issues.push({
      path: `env.repo.required[${index}]`,
      message: `Required repo runtime environment variable ${name} is missing from ${resolvedPath}.`
    });
  });

  repoConfig.optional.forEach((name) => {
    const value = projected[name];

    if (isPresentEnvironmentValue(value)) {
      optional[name] = value;
    }
  });

  if (issues.length > 0) {
    throw createManifestEnvResolutionError(issues, input.manifestPath ?? null);
  }

  return {
    path: resolvedPath,
    projected,
    required,
    optional
  };
}

export function resolveSymphonyRuntimeEnvBundle(
  input: SymphonyRuntimeEnvResolutionInput
): SymphonyResolvedRuntimeEnvBundle {
  const hostEnv = resolveSymphonyRuntimeHostEnv(input);
  const repoEnv = resolveSymphonyRuntimeRepoEnv(input);
  const issues: SymphonyRuntimeManifestIssue[] = [];
  const values: Record<string, string> = {
    ...(repoEnv?.projected ?? {}),
    ...hostEnv.required,
    ...hostEnv.optional
  };
  const staticBindingKeys: string[] = [];
  const runtimeBindingKeys: string[] = [];
  const serviceBindingKeys: string[] = [];

  for (const [name, binding] of Object.entries(input.manifest.env.inject)) {
    const resolved = resolveInjectedBinding(name, binding, input, issues);
    if (resolved === null) {
      continue;
    }

    values[name] = resolved;

    switch (binding.kind) {
      case "static":
        staticBindingKeys.push(name);
        break;
      case "runtime":
        runtimeBindingKeys.push(name);
        break;
      case "service":
        serviceBindingKeys.push(name);
        break;
    }
  }

  if (issues.length > 0) {
    throw createManifestEnvResolutionError(issues, input.manifestPath ?? null);
  }

  return {
    source: "manifest",
    values,
    summary: buildResolvedEnvBundleSummary({
      values,
      hostEnv,
      repoEnv,
      staticBindingKeys,
      runtimeBindingKeys,
      serviceBindingKeys
    })
  };
}

function resolveInjectedBinding(
  name: string,
  binding: SymphonyRuntimeEnvBinding,
  input: SymphonyRuntimeEnvResolutionInput,
  issues: SymphonyRuntimeManifestIssue[]
): string | null {
  switch (binding.kind) {
    case "static":
      return binding.value;
    case "runtime":
      return resolveRuntimeBinding(name, binding.value, input, issues);
    case "service":
      return resolveServiceBinding(name, binding.service, binding.value, input, issues);
  }
}

function resolveRuntimeBinding(
  name: string,
  bindingValue: SymphonyRuntimeBindingValue,
  input: SymphonyRuntimeEnvResolutionInput,
  issues: SymphonyRuntimeManifestIssue[]
): string | null {
  const value = runtimeBindingValue(bindingValue, input);

  if (typeof value === "string") {
    return value;
  }

  issues.push({
    path: `env.inject.${name}`,
    message: `Runtime binding ${bindingValue} is unavailable for ${name}.`
  });

  return null;
}

function resolveServiceBinding(
  name: string,
  serviceKey: string,
  bindingValue: SymphonyRuntimeServiceBindingValue,
  input: SymphonyRuntimeEnvResolutionInput,
  issues: SymphonyRuntimeManifestIssue[]
): string | null {
  const service = input.services?.[serviceKey];

  if (!service) {
    issues.push({
      path: `env.inject.${name}`,
      message: `Service binding ${serviceKey}.${bindingValue} could not be resolved because service metadata is unavailable.`
    });
    return null;
  }

  return serviceBindingValue(service, bindingValue);
}

function runtimeBindingValue(
  bindingValue: SymphonyRuntimeBindingValue,
  input: SymphonyRuntimeEnvResolutionInput
): string | null {
  switch (bindingValue) {
    case "issueId":
      return input.runtime.issueId;
    case "issueIdentifier":
      return input.runtime.issueIdentifier;
    case "runId":
      return input.runtime.runId;
    case "workspaceKey":
      return input.runtime.workspaceKey;
    case "workspacePath":
      return input.runtime.workspacePath;
    case "backendKind":
      return input.runtime.backendKind;
  }
}

function serviceBindingValue(
  service: SymphonyResolvedRuntimeService,
  bindingValue: SymphonyRuntimeServiceBindingValue
): string {
  switch (bindingValue) {
    case "connectionString":
      return service.connectionString;
    case "host":
      return service.host;
    case "port":
      return String(service.port);
    case "database":
      return service.database;
    case "username":
      return service.username;
    case "password":
      return service.password;
  }
}

function buildResolvedEnvBundleSummary(input: {
  values: Record<string, string>;
  hostEnv: SymphonyResolvedRuntimeHostEnv;
  repoEnv: SymphonyResolvedRuntimeRepoEnv | null;
  staticBindingKeys: string[];
  runtimeBindingKeys: string[];
  serviceBindingKeys: string[];
}): SymphonyResolvedRuntimeEnvBundleSummary {
  return {
    source: "manifest",
    injectedKeys: sortedKeys(input.values),
    requiredHostKeys: sortedKeys(input.hostEnv.required),
    optionalHostKeys: sortedKeys(input.hostEnv.optional),
    repoEnvPath: input.repoEnv?.path ?? null,
    projectedRepoKeys: sortedKeys(input.repoEnv?.projected ?? {}),
    requiredRepoKeys: sortedKeys(input.repoEnv?.required ?? {}),
    optionalRepoKeys: sortedKeys(input.repoEnv?.optional ?? {}),
    staticBindingKeys: [...input.staticBindingKeys].sort(),
    runtimeBindingKeys: [...input.runtimeBindingKeys].sort(),
    serviceBindingKeys: [...input.serviceBindingKeys].sort()
  };
}

export function buildSymphonyRuntimePostgresConnectionString(input: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}): string {
  return `postgresql://${encodeURIComponent(input.username)}:${encodeURIComponent(
    input.password
  )}@${input.host}:${input.port}/${encodeURIComponent(input.database)}`;
}

function sortedKeys(record: Record<string, string>): string[] {
  return Object.keys(record).sort();
}

function isPresentEnvironmentValue(value: string | undefined): value is string {
  return typeof value === "string" && value !== "";
}

function parseEnvironmentFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}
