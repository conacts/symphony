import {
  defaultSymphonyRuntimePostgresPort,
  defaultSymphonyRuntimeWorkingDirectory,
  type SymphonyNormalizedRuntimeManifest,
  type SymphonyNormalizedRuntimeService,
  type SymphonyRuntimeEnv,
  type SymphonyRuntimeEnvBinding,
  type SymphonyRuntimeManifest,
  type SymphonyRuntimeManifestValidationOptions,
  type SymphonyRuntimePostgresService,
  type SymphonyRuntimeStep,
} from "./runtime-manifest-contract.js";
import {
  createManifestValidationError,
  SymphonyRuntimeManifestError,
  type SymphonyRuntimeManifestIssue
} from "./runtime-manifest-errors.js";
import {
  collectDuplicates,
  formatManifestPath,
  hasIssuesSince,
  pushIssue,
  rejectUnknownKeys,
  startIssueCheckpoint
} from "./runtime-manifest-validation-issues.js";
import {
  parseEnvironmentVariableArray,
  readOptionalHostname,
  readOptionalNonNegativeInteger,
  readOptionalPort,
  readOptionalPositiveInteger,
  readOptionalRelativePath,
  readRequiredEnum,
  readRequiredString,
  readStrictRecord
} from "./runtime-manifest-validation-readers.js";
import {
  envHostKeys,
  envKeys,
  environmentVariablePattern,
  lifecycleKeys,
  manifestTopLevelKeys,
  postgresReadinessKeys,
  postgresResourceKeys,
  postgresServiceKeys,
  runtimeBindingValues,
  serviceBindingKeys,
  serviceBindingValues,
  serviceKeyPattern,
  staticBindingKeys,
  stepKeys,
  symphonyRuntimeManifestBrand,
  type ManifestPath,
  workspaceKeys,
  workspacePackageManagers
} from "./runtime-manifest-validation-shared.js";
import { isRecord } from "../internal/records.js";
type BrandedSymphonyRuntimeManifest = SymphonyNormalizedRuntimeManifest & {
  readonly [symphonyRuntimeManifestBrand]: true;
};
type ParsedServices = {
  declaredKeys: Set<string>;
  normalized: Record<string, SymphonyNormalizedRuntimeService>;
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

function parseServices(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): ParsedServices {
  if (value === undefined) {
    return {
      declaredKeys: new Set<string>(),
      normalized: {}
    };
  }

  const record = readStrictRecord(value, ["services"], issues, "services");

  if (!record) {
    return {
      declaredKeys: new Set<string>(),
      normalized: {}
    };
  }

  const declaredKeys = new Set<string>();
  const normalized: Record<string, SymphonyNormalizedRuntimeService> = {};

  for (const [serviceKey, serviceValue] of Object.entries(record)) {
    if (!serviceKeyPattern.test(serviceKey)) {
      pushIssue(
        issues,
        ["services", serviceKey],
        "Service keys must match ^[a-z][a-z0-9-]*$."
      );
      continue;
    }

    declaredKeys.add(serviceKey);
    const parsedService = parseService(serviceKey, serviceValue, issues);
    if (parsedService) {
      normalized[serviceKey] = parsedService;
    }
  }

  return {
    declaredKeys,
    normalized
  };
}

function parseService(
  serviceKey: string,
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyNormalizedRuntimeService | undefined {
  const checkpoint = startIssueCheckpoint(issues);
  const servicePath: ManifestPath = ["services", serviceKey];
  const record = readStrictRecord(value, servicePath, issues, "service");

  if (!record) {
    return undefined;
  }

  const type = record.type;
  if (type !== "postgres") {
    rejectUnknownKeys(record, postgresServiceKeys, servicePath, issues);
    pushIssue(
      issues,
      [...servicePath, "type"],
      `Unsupported service type ${JSON.stringify(type)}. Only "postgres" is supported in schemaVersion 1.`
    );
    return undefined;
  }

  rejectUnknownKeys(record, postgresServiceKeys, servicePath, issues);

  const image = readRequiredString(
    record,
    "image",
    [...servicePath, "image"],
    issues,
    `${formatManifestPath(servicePath)}.image`
  );
  const hostname =
    readOptionalHostname(
      record,
      "hostname",
      [...servicePath, "hostname"],
      issues,
      `${formatManifestPath(servicePath)}.hostname`
    ) ?? serviceKey;
  const port =
    readOptionalPort(
      record,
      "port",
      [...servicePath, "port"],
      issues,
      `${formatManifestPath(servicePath)}.port`
    ) ?? defaultSymphonyRuntimePostgresPort;
  const database = readRequiredString(
    record,
    "database",
    [...servicePath, "database"],
    issues,
    `${formatManifestPath(servicePath)}.database`
  );
  const username = readRequiredString(
    record,
    "username",
    [...servicePath, "username"],
    issues,
    `${formatManifestPath(servicePath)}.username`
  );
  const password = readRequiredString(
    record,
    "password",
    [...servicePath, "password"],
    issues,
    `${formatManifestPath(servicePath)}.password`
  );
  const resources = parseOptionalResources(
    record.resources,
    [...servicePath, "resources"],
    issues
  );
  const readiness = parseOptionalReadiness(
    record.readiness,
    [...servicePath, "readiness"],
    issues
  );
  const init = parseOptionalStepArray(
    record.init,
    [...servicePath, "init"],
    issues
  );

  if (
    !image ||
    !database ||
    !username ||
    !password ||
    !init ||
    hasIssuesSince(issues, checkpoint)
  ) {
    return undefined;
  }

  return {
    type: "postgres",
    image,
    hostname,
    port,
    database,
    username,
    password,
    ...(resources ? { resources } : {}),
    ...(readiness ? { readiness } : {}),
    init
  };
}

function parseOptionalResources(
  value: unknown,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyRuntimePostgresService["resources"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(value, pathSegments, issues, formatManifestPath(pathSegments));

  if (!record) {
    return undefined;
  }

  rejectUnknownKeys(record, postgresResourceKeys, pathSegments, issues);

  const memoryMb = readOptionalPositiveInteger(
    record,
    "memoryMb",
    [...pathSegments, "memoryMb"],
    issues,
    `${formatManifestPath(pathSegments)}.memoryMb`
  );
  const cpuShares = readOptionalPositiveInteger(
    record,
    "cpuShares",
    [...pathSegments, "cpuShares"],
    issues,
    `${formatManifestPath(pathSegments)}.cpuShares`
  );

  if (hasIssuesSince(issues, checkpoint)) {
    return undefined;
  }

  if (memoryMb === undefined && cpuShares === undefined) {
    return undefined;
  }

  return {
    ...(memoryMb === undefined ? {} : { memoryMb }),
    ...(cpuShares === undefined ? {} : { cpuShares })
  };
}

function parseOptionalReadiness(
  value: unknown,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyRuntimePostgresService["readiness"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(value, pathSegments, issues, formatManifestPath(pathSegments));

  if (!record) {
    return undefined;
  }

  rejectUnknownKeys(record, postgresReadinessKeys, pathSegments, issues);

  const timeoutMs = readOptionalPositiveInteger(
    record,
    "timeoutMs",
    [...pathSegments, "timeoutMs"],
    issues,
    `${formatManifestPath(pathSegments)}.timeoutMs`
  );
  const intervalMs = readOptionalPositiveInteger(
    record,
    "intervalMs",
    [...pathSegments, "intervalMs"],
    issues,
    `${formatManifestPath(pathSegments)}.intervalMs`
  );
  const retries = readOptionalNonNegativeInteger(
    record,
    "retries",
    [...pathSegments, "retries"],
    issues,
    `${formatManifestPath(pathSegments)}.retries`
  );

  if (hasIssuesSince(issues, checkpoint)) {
    return undefined;
  }

  if (
    timeoutMs === undefined &&
    intervalMs === undefined &&
    retries === undefined
  ) {
    return undefined;
  }

  return {
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(intervalMs === undefined ? {} : { intervalMs }),
    ...(retries === undefined ? {} : { retries })
  };
}

function parseEnv(
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

function parseLifecycle(
  value: unknown,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyNormalizedRuntimeManifest["lifecycle"] | undefined {
  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(value, ["lifecycle"], issues, "lifecycle");

  if (!record) {
    return undefined;
  }

  rejectUnknownKeys(record, lifecycleKeys, ["lifecycle"], issues);

  const bootstrap = parseRequiredStepArray(
    record.bootstrap,
    ["lifecycle", "bootstrap"],
    issues
  );
  const migrate = parseRequiredStepArray(
    record.migrate,
    ["lifecycle", "migrate"],
    issues
  );
  const verify = parseRequiredNonEmptyStepArray(
    record.verify,
    ["lifecycle", "verify"],
    issues
  );
  const seed = parseOptionalStepArray(record.seed, ["lifecycle", "seed"], issues);
  const cleanup = parseOptionalStepArray(
    record.cleanup,
    ["lifecycle", "cleanup"],
    issues
  );

  if (
    !bootstrap ||
    !migrate ||
    !verify ||
    !seed ||
    !cleanup ||
    hasIssuesSince(issues, checkpoint)
  ) {
    return undefined;
  }

  return {
    bootstrap,
    migrate,
    verify: toNonEmptyStepArray(verify),
    seed,
    cleanup
  };
}

function parseRequiredStepArray(
  value: unknown,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyRuntimeStep[] | undefined {
  return parseStepArray(value, pathSegments, issues, {
    required: true,
    requireNonEmpty: false
  });
}

function parseRequiredNonEmptyStepArray(
  value: unknown,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyRuntimeStep[] | undefined {
  return parseStepArray(value, pathSegments, issues, {
    required: true,
    requireNonEmpty: true
  });
}

function parseOptionalStepArray(
  value: unknown,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyRuntimeStep[] | undefined {
  return parseStepArray(value, pathSegments, issues, {
    required: false,
    requireNonEmpty: false
  });
}

function parseStepArray(
  value: unknown,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  options: {
    required: boolean;
    requireNonEmpty: boolean;
  }
): SymphonyRuntimeStep[] | undefined {
  if (value === undefined) {
    if (options.required) {
      pushIssue(
        issues,
        pathSegments,
        `${formatManifestPath(pathSegments)} must be an array.`
      );
      return undefined;
    }

    return [];
  }

  if (!Array.isArray(value)) {
    pushIssue(
      issues,
      pathSegments,
      `${formatManifestPath(pathSegments)} must be an array.`
    );
    return undefined;
  }

  if (options.requireNonEmpty && value.length === 0) {
    pushIssue(
      issues,
      pathSegments,
      `${formatManifestPath(pathSegments)} must contain at least one step.`
    );
    return undefined;
  }

  const checkpoint = startIssueCheckpoint(issues);
  const steps: SymphonyRuntimeStep[] = [];

  for (const [index, step] of value.entries()) {
    const parsedStep = parseStep(step, [...pathSegments, index], issues);
    if (parsedStep) {
      steps.push(parsedStep);
    }
  }

  return hasIssuesSince(issues, checkpoint) ? undefined : steps;
}

function parseStep(
  value: unknown,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[]
): SymphonyRuntimeStep | undefined {
  const checkpoint = startIssueCheckpoint(issues);
  const record = readStrictRecord(
    value,
    pathSegments,
    issues,
    formatManifestPath(pathSegments)
  );

  if (!record) {
    return undefined;
  }

  rejectUnknownKeys(record, stepKeys, pathSegments, issues);

  const name = readRequiredString(
    record,
    "name",
    [...pathSegments, "name"],
    issues,
    `${formatManifestPath(pathSegments)}.name`
  );
  const run = readRequiredString(
    record,
    "run",
    [...pathSegments, "run"],
    issues,
    `${formatManifestPath(pathSegments)}.run`
  );
  const cwd = readOptionalRelativePath(
    record,
    "cwd",
    [...pathSegments, "cwd"],
    issues,
    `${formatManifestPath(pathSegments)}.cwd`
  );
  const timeoutMs = readOptionalPositiveInteger(
    record,
    "timeoutMs",
    [...pathSegments, "timeoutMs"],
    issues,
    `${formatManifestPath(pathSegments)}.timeoutMs`
  );

  if (!name || !run || hasIssuesSince(issues, checkpoint)) {
    return undefined;
  }

  return {
    name,
    run,
    ...(cwd === undefined ? {} : { cwd }),
    ...(timeoutMs === undefined ? {} : { timeoutMs })
  };
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

function validateServiceReferences(
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

function validateUniqueServiceHostnames(
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

function toNonEmptyStepArray(
  steps: SymphonyRuntimeStep[]
): [SymphonyRuntimeStep, ...SymphonyRuntimeStep[]] {
  const [first, ...rest] = steps;

  if (!first) {
    throw new Error("Expected a non-empty runtime step array.");
  }

  return [first, ...rest];
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
