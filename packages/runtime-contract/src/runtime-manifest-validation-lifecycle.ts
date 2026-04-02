import type { SymphonyRuntimeStep } from "./runtime-manifest-contract.js";
import type { SymphonyRuntimeManifestIssue } from "./runtime-manifest-errors.js";
import {
  formatManifestPath,
  hasIssuesSince,
  pushIssue,
  rejectUnknownKeys,
  startIssueCheckpoint
} from "./runtime-manifest-validation-issues.js";
import {
  readOptionalPositiveInteger,
  readOptionalRelativePath,
  readRequiredString,
  readStrictRecord
} from "./runtime-manifest-validation-readers.js";
import {
  lifecycleKeys,
  stepKeys,
  type ManifestPath
} from "./runtime-manifest-validation-shared.js";
import type { SymphonyNormalizedRuntimeManifest } from "./runtime-manifest-contract.js";

export function parseLifecycle(
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

export function parseOptionalStepArray(
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

function toNonEmptyStepArray(
  steps: SymphonyRuntimeStep[]
): [SymphonyRuntimeStep, ...SymphonyRuntimeStep[]] {
  const [first, ...rest] = steps;

  if (!first) {
    throw new Error("Expected a non-empty runtime step array.");
  }

  return [first, ...rest];
}
