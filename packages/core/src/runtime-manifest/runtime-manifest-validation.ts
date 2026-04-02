import {
  defaultSymphonyRuntimePostgresPort,
  defaultSymphonyRuntimeWorkingDirectory,
  type SymphonyNormalizedRuntimeManifest,
  type SymphonyNormalizedRuntimeService,
  type SymphonyRuntimeManifest,
  type SymphonyRuntimeManifestValidationOptions,
  type SymphonyRuntimePostgresService,
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
  formatManifestPath,
  hasIssuesSince,
  pushIssue,
  rejectUnknownKeys,
  startIssueCheckpoint
} from "./runtime-manifest-validation-issues.js";
import {
  parseLifecycle,
  parseOptionalStepArray
} from "./runtime-manifest-validation-lifecycle.js";
import {
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
  manifestTopLevelKeys,
  postgresReadinessKeys,
  postgresResourceKeys,
  postgresServiceKeys,
  serviceKeyPattern,
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
