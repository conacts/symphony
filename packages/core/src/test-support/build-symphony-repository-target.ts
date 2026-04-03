import type { SymphonyRepositoryTarget } from "../core/repository-target.js";

let repositoryTargetCounter = 0;

export function buildSymphonyRepositoryTarget(
  overrides: Partial<SymphonyRepositoryTarget> = {}
): SymphonyRepositoryTarget {
  repositoryTargetCounter += 1;

  return {
    id: `repository-target-${repositoryTargetCounter}`,
    slug: `repository-target-${repositoryTargetCounter}`,
    promptPath: `/tmp/symphony/repository-target-${repositoryTargetCounter}/.symphony/prompt.md`,
    ...overrides
  };
}
