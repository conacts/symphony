import {
  defaultSymphonyRuntimePostgresPort,
  type SymphonyNormalizedRuntimeService,
  type SymphonyRuntimePostgresService
} from "./runtime-manifest-contract.js";
import type { SymphonyRuntimeManifestIssue } from "./runtime-manifest-errors.js";
import {
  formatManifestPath,
  hasIssuesSince,
  pushIssue,
  rejectUnknownKeys,
  startIssueCheckpoint
} from "./runtime-manifest-validation-issues.js";
import { parseOptionalStepArray } from "./runtime-manifest-validation-lifecycle.js";
import {
  readOptionalHostname,
  readOptionalNonNegativeInteger,
  readOptionalPort,
  readOptionalPositiveInteger,
  readRequiredString,
  readStrictRecord
} from "./runtime-manifest-validation-readers.js";
import {
  postgresReadinessKeys,
  postgresResourceKeys,
  postgresServiceKeys,
  serviceKeyPattern,
  type ManifestPath
} from "./runtime-manifest-validation-shared.js";

export type ParsedServices = {
  declaredKeys: Set<string>;
  normalized: Record<string, SymphonyNormalizedRuntimeService>;
};

export function parseServices(
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
  const record = readStrictRecord(
    value,
    pathSegments,
    issues,
    formatManifestPath(pathSegments)
  );

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
  const record = readStrictRecord(
    value,
    pathSegments,
    issues,
    formatManifestPath(pathSegments)
  );

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
