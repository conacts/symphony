import {
  createLinearSymphonyTracker,
  createMemorySymphonyTracker,
  type SymphonyTracker,
  type SymphonyTrackerConfig,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";

type RepositoryLinearTrackerEntry = {
  repositoryKey: string;
  config: SymphonyTrackerConfig;
  tracker: SymphonyTracker;
};

export type RepositoryLinearTrackerFactory = (
  config: SymphonyTrackerConfig
) => SymphonyTracker;

export function createRepositoryScopedLinearTracker(input: {
  trackerTemplate: SymphonyTrackerConfig;
  admittedRepositories: AdmittedRuntimeRepository[];
  environmentSource: Record<string, string | undefined>;
  createTracker?: RepositoryLinearTrackerFactory;
}): SymphonyTracker {
  if (input.trackerTemplate.kind !== "linear") {
    return createMemorySymphonyTracker([]);
  }

  const createTracker =
    input.createTracker ??
    ((config: SymphonyTrackerConfig): SymphonyTracker =>
      createLinearSymphonyTracker({ config }));
  const trackerEntries = buildRepositoryLinearTrackerEntries({
    trackerTemplate: input.trackerTemplate,
    admittedRepositories: input.admittedRepositories,
    environmentSource: input.environmentSource,
    createTracker
  });
  const trackersByRepositoryKey = new Map(
    trackerEntries.map((entry) => [entry.repositoryKey, entry] as const)
  );
  const issueRepositoryKeys = new Map<string, string>();

  return {
    async fetchCandidateIssues(config) {
      return await collectIssues(
        trackerEntries,
        issueRepositoryKeys,
        (entry) =>
          entry.tracker.fetchCandidateIssues(
            mergeTrackerConfigs(config, entry.config)
          ),
        false
      );
    },

    async fetchIssuesByStates(config, states) {
      return await collectIssues(
        trackerEntries,
        issueRepositoryKeys,
        (entry) =>
          entry.tracker.fetchIssuesByStates(
            mergeTrackerConfigs(config, entry.config),
            states
          ),
        false
      );
    },

    async fetchIssueStatesByIds(config, issueIds) {
      return await collectIssues(
        trackerEntries,
        issueRepositoryKeys,
        (entry) =>
          entry.tracker.fetchIssueStatesByIds(
            mergeTrackerConfigs(config, entry.config),
            issueIds
          ),
        true
      );
    },

    async fetchIssueByIdentifier(config, issueIdentifier) {
      const identifier = issueIdentifier.trim();
      if (identifier === "") {
        return null;
      }

      let resolvedIssue: SymphonyTrackerIssue | null = null;
      let resolvedRepositoryKey: string | null = null;

      for (const entry of trackerEntries) {
        const issue = await entry.tracker.fetchIssueByIdentifier(
          mergeTrackerConfigs(config, entry.config),
          identifier
        );

        if (!issue) {
          continue;
        }

        if (resolvedIssue && resolvedRepositoryKey !== entry.repositoryKey) {
          throw new TypeError(
            `Issue ${identifier} matches multiple admitted repositories.`
          );
        }

        resolvedIssue = issue;
        resolvedRepositoryKey = entry.repositoryKey;
        cacheIssueRepository(issueRepositoryKeys, issue, entry.repositoryKey);
      }

      return resolvedIssue;
    },

    async createComment(issueId, body) {
      const entry = await resolveEntryForIssueId(
        trackerEntries,
        trackersByRepositoryKey,
        issueRepositoryKeys,
        issueId
      );
      await entry.tracker.createComment(issueId, body);
    },

    async updateIssueState(issueId, stateName) {
      const entry = await resolveEntryForIssueId(
        trackerEntries,
        trackersByRepositoryKey,
        issueRepositoryKeys,
        issueId
      );
      await entry.tracker.updateIssueState(issueId, stateName);
    }
  };
}

function buildRepositoryLinearTrackerEntries(input: {
  trackerTemplate: SymphonyTrackerConfig;
  admittedRepositories: AdmittedRuntimeRepository[];
  environmentSource: Record<string, string | undefined>;
  createTracker: RepositoryLinearTrackerFactory;
}): RepositoryLinearTrackerEntry[] {
  const repositories =
    input.admittedRepositories.length > 0
      ? input.admittedRepositories
      : [
          {
            repositoryKey: "default",
            linearBinding: {
              projectSlug: input.trackerTemplate.projectSlug,
              teamKey: input.trackerTemplate.teamKey,
              apiKeyEnvKey: null
            }
          } as AdmittedRuntimeRepository
        ];

  return repositories.map((repository) => {
    const config = buildRepositoryLinearTrackerConfig(
      input.trackerTemplate,
      repository,
      input.environmentSource
    );

    return {
      repositoryKey: repository.repositoryKey,
      config,
      tracker: input.createTracker(config)
    };
  });
}

function buildRepositoryLinearTrackerConfig(
  trackerTemplate: SymphonyTrackerConfig,
  repository: AdmittedRuntimeRepository,
  environmentSource: Record<string, string | undefined>
): SymphonyTrackerConfig {
  const apiKeyEnvKey = repository.linearBinding.apiKeyEnvKey;
  const apiKey =
    apiKeyEnvKey !== null
      ? normalizeRequiredEnvironmentValue(
          environmentSource[apiKeyEnvKey],
          `Admitted repository ${JSON.stringify(repository.repositoryKey)} requires ${apiKeyEnvKey}, but that environment variable is missing.`
        )
      : trackerTemplate.apiKey;

  return {
    ...trackerTemplate,
    apiKey,
    projectSlug: repository.linearBinding.projectSlug,
    teamKey: repository.linearBinding.teamKey
  };
}

function mergeTrackerConfigs(
  base: SymphonyTrackerConfig,
  override: SymphonyTrackerConfig
): SymphonyTrackerConfig {
  return {
    ...base,
    ...override
  };
}

async function collectIssues(
  entries: Iterable<RepositoryLinearTrackerEntry>,
  issueRepositoryKeys: Map<string, string>,
  fetchIssues: (entry: RepositoryLinearTrackerEntry) => Promise<SymphonyTrackerIssue[]>,
  dedupeIssueIds: boolean
): Promise<SymphonyTrackerIssue[]> {
  const resolvedIssues: SymphonyTrackerIssue[] = [];
  const seenIssueIds = new Set<string>();

  for (const entry of entries) {
    const issues = await fetchIssues(entry);
    for (const issue of issues) {
      cacheIssueRepository(issueRepositoryKeys, issue, entry.repositoryKey);

      if (dedupeIssueIds && seenIssueIds.has(issue.id)) {
        continue;
      }

      seenIssueIds.add(issue.id);
      resolvedIssues.push(issue);
    }
  }

  return resolvedIssues;
}

async function resolveEntryForIssueId(
  trackerEntries: Iterable<RepositoryLinearTrackerEntry>,
  trackersByRepositoryKey: Map<string, RepositoryLinearTrackerEntry>,
  issueRepositoryKeys: Map<string, string>,
  issueId: string
): Promise<RepositoryLinearTrackerEntry> {
  const cachedRepositoryKey = issueRepositoryKeys.get(issueId);
  if (cachedRepositoryKey) {
    return requireTrackerEntry(trackersByRepositoryKey, cachedRepositoryKey);
  }

  const entries = [...trackerEntries];
  if (entries.length === 1) {
    const onlyEntry = entries[0]!;
    cacheIssueRepository(
      issueRepositoryKeys,
      { id: issueId } as SymphonyTrackerIssue,
      onlyEntry.repositoryKey
    );
    return onlyEntry;
  }

  let resolvedEntry: RepositoryLinearTrackerEntry | null = null;

  for (const entry of entries) {
    const issues = await entry.tracker.fetchIssueStatesByIds(entry.config, [
      issueId
    ]);
    if (issues.length === 0) {
      continue;
    }

    if (resolvedEntry && resolvedEntry.repositoryKey !== entry.repositoryKey) {
      throw new TypeError(
        `Issue ${issueId} matches multiple admitted repositories.`
      );
    }

    resolvedEntry = entry;
    for (const issue of issues) {
      cacheIssueRepository(issueRepositoryKeys, issue, entry.repositoryKey);
    }
  }

  if (!resolvedEntry) {
    throw new TypeError(
      `Issue ${issueId} does not match any admitted repository.`
    );
  }

  return resolvedEntry;
}

function requireTrackerEntry(
  trackersByRepositoryKey: Map<string, RepositoryLinearTrackerEntry>,
  repositoryKey: string
): RepositoryLinearTrackerEntry {
  const entry = trackersByRepositoryKey.get(repositoryKey);
  if (!entry) {
    throw new TypeError(
      `Issue references unknown admitted repository ${JSON.stringify(repositoryKey)}.`
    );
  }

  return entry;
}

function cacheIssueRepository(
  issueRepositoryKeys: Map<string, string>,
  issue: Pick<SymphonyTrackerIssue, "id">,
  repositoryKey: string
): void {
  const existingRepositoryKey = issueRepositoryKeys.get(issue.id);
  if (existingRepositoryKey && existingRepositoryKey !== repositoryKey) {
    throw new TypeError(
      `Issue ${issue.id} matches multiple admitted repositories.`
    );
  }

  issueRepositoryKeys.set(issue.id, repositoryKey);
}

function normalizeRequiredEnvironmentValue(
  value: string | undefined,
  errorMessage: string
): string {
  if (typeof value !== "string") {
    throw new TypeError(errorMessage);
  }

  const normalized = value.trim();
  if (normalized === "") {
    throw new TypeError(errorMessage);
  }

  return normalized;
}
