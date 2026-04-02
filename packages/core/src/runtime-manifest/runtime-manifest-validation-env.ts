import type {
  SymphonyNormalizedRuntimeService,
  SymphonyRuntimeEnv,
  SymphonyRuntimeEnvBinding
} from "./runtime-manifest-contract.js";
import type { SymphonyRuntimeManifestIssue } from "./runtime-manifest-errors.js";
import {
  formatManifestPath,
  hasIssuesSince,
  pushIssue,
  rejectUnknownKeys,
  startIssueCheckpoint,
  collectDuplicates
} from "./runtime-manifest-validation-issues.js";
import {
  parseEnvironmentVariableArray,
  readRequiredEnum,
  readRequiredString,
  readStrictRecord
} from "./runtime-manifest-validation-readers.js";
import {
  envHostKeys,
  envKeys,
  environmentVariablePattern,
  runtimeBindingValues,
  serviceBindingKeys,
  serviceBindingValues,
  serviceKeyPattern,
  staticBindingKeys,
  type ManifestPath
} from "./runtime-manifest-validation-shared.js";

export function parseEnv(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyRuntimeEnv | undefined {
  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(value, ["env"], issues, "env");

  if (!record) {
    return undefined;
  }

  rejectUnknownKeys(record, envKeys, ["env"], issues);

  const host = parseEnvHost(record.host, issues);
  if (host) {
    validateHostEnvironmentLists(host, issues);
  }

  const inject = parseEnvInject(record.inject, issues);

  if (!host || !inject || hasIssuesSince(issues, checkpoint)) {
    return undefined;
  }

  return {
    host,
    inject
  };
}

export function validateServiceReferences(
  inject: Record<string, SymphonyRuntimeEnvBinding>,
  declaredServiceKeys: Set<string>,
  issues: SymphonyRuntimeManifestIssue[]
): void {
  for (const [environmentVariable, binding] of Object.entries(inject)) {
    if (
      binding.kind === "service" &&
      !declaredServiceKeys.has(binding.service)
    ) {
      pushIssue(
        issues,
        ["env", "inject", environmentVariable, "service"],
        `Unknown service ${JSON.stringify(binding.service)}.`
      );
    }
  }
}

export function validateUniqueServiceHostnames(
  services: Record<string, SymphonyNormalizedRuntimeService>,
  issues: SymphonyRuntimeManifestIssue[]
): void {
  const seenHostnames = new Map<string, string>();

  for (const [serviceKey, service] of Object.entries(services)) {
    const existingService = seenHostnames.get(service.hostname);
    if (existingService) {
      pushIssue(
        issues,
        ["services", serviceKey, "hostname"],
        `Hostname ${JSON.stringify(service.hostname)} is already used by service ${JSON.stringify(existingService)}.`
      );
      continue;
    }

    seenHostnames.set(service.hostname, serviceKey);
  }
}

function parseEnvHost(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyRuntimeEnv["host"] | undefined {
  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(value, ["env", "host"], issues, "env.host");

  if (!record) {
    return undefined;
  }

  rejectUnknownKeys(record, envHostKeys, ["env", "host"], issues);

  const required = parseEnvironmentVariableArray(
    record.required,
    ["env", "host", "required"],
    issues,
    "env.host.required"
  );
  const optional = parseEnvironmentVariableArray(
    record.optional,
    ["env", "host", "optional"],
    issues,
    "env.host.optional"
  );

  if (!required || !optional || hasIssuesSince(issues, checkpoint)) {
    return undefined;
  }

  return {
    required,
    optional
  };
}

function parseEnvInject(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): Record<string, SymphonyRuntimeEnvBinding> | undefined {
  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(value, ["env", "inject"], issues, "env.inject");

  if (!record) {
    return undefined;
  }

  const inject: Record<string, SymphonyRuntimeEnvBinding> = {};

  for (const [environmentVariable, bindingValue] of Object.entries(record)) {
    if (!environmentVariablePattern.test(environmentVariable)) {
      pushIssue(
        issues,
        ["env", "inject", environmentVariable],
        "Injected env variable names must match ^[A-Z][A-Z0-9_]*$."
      );
    }

    const parsedBinding = parseEnvBinding(environmentVariable, bindingValue, issues);
    if (parsedBinding) {
      inject[environmentVariable] = parsedBinding;
    }
  }

  return hasIssuesSince(issues, checkpoint) ? undefined : inject;
}

function parseEnvBinding(
  environmentVariable: string,
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyRuntimeEnvBinding | undefined {
  const checkpoint = startIssueCheckpoint(issues);
  const bindingPath: ManifestPath = ["env", "inject", environmentVariable];
  const record = readStrictRecord(value, bindingPath, issues, "env binding");

  if (!record) {
    return undefined;
  }

  switch (record.kind) {
    case "static": {
      rejectUnknownKeys(record, staticBindingKeys, bindingPath, issues);
      const bindingValue = readRequiredString(
        record,
        "value",
        [...bindingPath, "value"],
        issues,
        `${formatManifestPath(bindingPath)}.value`
      );

      if (!bindingValue || hasIssuesSince(issues, checkpoint)) {
        return undefined;
      }

      return {
        kind: "static",
        value: bindingValue
      };
    }

    case "service": {
      rejectUnknownKeys(record, serviceBindingKeys, bindingPath, issues);
      const service = readRequiredString(
        record,
        "service",
        [...bindingPath, "service"],
        issues,
        `${formatManifestPath(bindingPath)}.service`
      );

      if (service && !serviceKeyPattern.test(service)) {
        pushIssue(
          issues,
          [...bindingPath, "service"],
          "Service bindings must reference service keys that match ^[a-z][a-z0-9-]*$."
        );
      }

      const bindingValue = readRequiredEnum(
        record,
        "value",
        serviceBindingValues,
        [...bindingPath, "value"],
        issues,
        `${formatManifestPath(bindingPath)}.value`
      );

      if (!service || !bindingValue || hasIssuesSince(issues, checkpoint)) {
        return undefined;
      }

      return {
        kind: "service",
        service,
        value: bindingValue
      };
    }

    case "runtime": {
      rejectUnknownKeys(record, staticBindingKeys, bindingPath, issues);
      const bindingValue = readRequiredEnum(
        record,
        "value",
        runtimeBindingValues,
        [...bindingPath, "value"],
        issues,
        `${formatManifestPath(bindingPath)}.value`
      );

      if (!bindingValue || hasIssuesSince(issues, checkpoint)) {
        return undefined;
      }

      return {
        kind: "runtime",
        value: bindingValue
      };
    }

    default:
      pushIssue(
        issues,
        [...bindingPath, "kind"],
        `env binding kind must be one of "static", "service", or "runtime"; received ${JSON.stringify(record.kind)}.`
      );
      return undefined;
  }
}

function validateHostEnvironmentLists(
  host: SymphonyRuntimeEnv["host"],
  issues: SymphonyRuntimeManifestIssue[]
): void {
  const required = new Set(host.required);

  for (const duplicate of collectDuplicates(host.required)) {
    pushIssue(
      issues,
      ["env", "host", "required"],
      `env.host.required contains duplicate entry ${JSON.stringify(duplicate)}.`
    );
  }

  for (const duplicate of collectDuplicates(host.optional)) {
    pushIssue(
      issues,
      ["env", "host", "optional"],
      `env.host.optional contains duplicate entry ${JSON.stringify(duplicate)}.`
    );
  }

  for (const name of host.optional) {
    if (required.has(name)) {
      pushIssue(
        issues,
        ["env", "host", "optional"],
        `${JSON.stringify(name)} cannot appear in both env.host.required and env.host.optional.`
      );
    }
  }
}
