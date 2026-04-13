import {
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  type SymphonyDb,
  type SymphonyIssueStore,
  type SymphonyIssueTimelineStore,
  type SymphonyLifecycleBindingScope,
  type SymphonyRuntimeLogEntry,
  type SymphonyRuntimeLogStore
} from "@symphony/db";

type SymphonyResolvedIssueRecord = Awaited<
  ReturnType<SymphonyIssueStore["fetchByTrackerIssueKey"]>
>;

export function createRepositoryAwareIssueTimelineStore(input: {
  db: SymphonyDb["db"];
  issueStore: SymphonyIssueStore;
  defaultRepositoryKey: string;
  bindingScope?: SymphonyLifecycleBindingScope | null;
}): SymphonyIssueTimelineStore {
  const storeCache = new Map<string, SymphonyIssueTimelineStore>();

  const storeFor = (repositoryKey: string) => {
    const cached = storeCache.get(repositoryKey);
    if (cached) {
      return cached;
    }

    const store = createSymphonyIssueTimelineStore(input.db, {
      repositoryKey,
      bindingScope: input.bindingScope ?? null
    });
    storeCache.set(repositoryKey, store);
    return store;
  };

  return {
    async record(recordInput) {
      const issue = await requireIssueRecord({
        issueStore: input.issueStore,
        bindingScope: input.bindingScope ?? null,
        owner: "Issue timeline",
        trackerIssueId: recordInput.trackerIssueId ?? null,
        trackerIssueKey: recordInput.trackerIssueKey ?? null
      });

      return await storeFor(issue.repositoryKey).record({
        ...recordInput,
        trackerIssueKey: issue.trackerIssueKey,
        trackerIssueId: issue.trackerIssueId
      });
    },

    async listIssueTimeline(trackerIssueKey, query) {
      const issue = await loadIssueRecord({
        issueStore: input.issueStore,
        bindingScope: input.bindingScope ?? null,
        trackerIssueKey
      });
      if (!issue) {
        return [];
      }

      return await storeFor(issue.repositoryKey).listIssueTimeline(
        issue.trackerIssueKey,
        query
      );
    }
  };
}

export function createRepositoryAwareRuntimeLogStore(input: {
  db: SymphonyDb["db"];
  issueStore: SymphonyIssueStore;
  defaultRepositoryKey: string;
  repositoryKeys?: string[];
  bindingScope?: SymphonyLifecycleBindingScope | null;
}): SymphonyRuntimeLogStore {
  const storeCache = new Map<string, SymphonyRuntimeLogStore>();

  const storeFor = (repositoryKey: string) => {
    const cached = storeCache.get(repositoryKey);
    if (cached) {
      return cached;
    }

    const store = createSymphonyRuntimeLogStore(input.db, {
      repositoryKey,
      bindingScope: input.bindingScope ?? null
    });
    storeCache.set(repositoryKey, store);
    return store;
  };
  const defaultStore = storeFor(input.defaultRepositoryKey);

  return {
    async record(recordInput) {
      const hasIssueScope =
        recordInput.trackerIssueId !== undefined &&
        recordInput.trackerIssueId !== null;

      if (!hasIssueScope) {
        return await defaultStore.record(recordInput);
      }

      const issue = await requireIssueRecord({
        issueStore: input.issueStore,
        bindingScope: input.bindingScope ?? null,
        owner: "Runtime log",
        trackerIssueId: recordInput.trackerIssueId ?? null,
        trackerIssueKey: recordInput.trackerIssueKey ?? null
      });

      return await storeFor(issue.repositoryKey).record({
        ...recordInput,
        trackerIssueKey: issue.trackerIssueKey,
        trackerIssueId: issue.trackerIssueId
      });
    },

    async list(query = {}) {
      if (query.trackerIssueKey) {
        const issue = await loadIssueRecord({
          issueStore: input.issueStore,
          bindingScope: input.bindingScope ?? null,
          trackerIssueKey: query.trackerIssueKey
        });
        if (!issue) {
          return [];
        }

        return await storeFor(issue.repositoryKey).list({
          limit: query.limit,
          repo: query.repo,
          trackerIssueKey: issue.trackerIssueKey
        });
      }

      const limit = normalizeLimit(query.limit, 200);
      const repositoryKeys =
        query.repo === undefined
          ? collectRepositoryKeys({
              defaultRepositoryKey: input.defaultRepositoryKey,
              configuredRepositoryKeys: input.repositoryKeys ?? [],
              cachedRepositoryKeys: [...storeCache.keys()]
            })
          : [query.repo];
      const entries = (
        await Promise.all(
          repositoryKeys.map((repositoryKey) =>
            storeFor(repositoryKey).list({
              limit,
              repo: query.repo
            })
          )
        )
      ).flat();

      return entries
        .sort(compareRuntimeLogEntriesDescending)
        .slice(0, limit);
    }
  };
}

async function requireIssueRecord(input: {
  issueStore: SymphonyIssueStore;
  bindingScope: SymphonyLifecycleBindingScope | null;
  owner: string;
  trackerIssueId: string | null;
  trackerIssueKey?: string | null;
}): Promise<NonNullable<SymphonyResolvedIssueRecord>> {
  const trackerIssueId = normalizeOptionalText(input.trackerIssueId);
  if (!trackerIssueId) {
    throw new TypeError(`${input.owner} trackerIssueId is required.`);
  }

  const issue = await input.issueStore.fetchByTrackerIssueId(trackerIssueId);
  if (!issue) {
    throw new TypeError(
      `${input.owner} issue not found: ${trackerIssueId}`
    );
  }

  if (
    input.trackerIssueKey !== undefined &&
    input.trackerIssueKey !== null &&
    issue.trackerIssueKey !== input.trackerIssueKey
  ) {
    throw new TypeError(
      `${input.owner} tracker issue key mismatch for ${issue.trackerIssueId}: ${issue.trackerIssueKey} is not ${input.trackerIssueKey}.`
    );
  }

  return issue;
}

async function loadIssueRecord(input: {
  issueStore: SymphonyIssueStore;
  bindingScope: SymphonyLifecycleBindingScope | null;
  trackerIssueKey?: string | null;
  trackerIssueId?: string | null;
}): Promise<SymphonyResolvedIssueRecord> {
  const trackerIssueId = normalizeOptionalText(input.trackerIssueId);
  const trackerIssueKey = normalizeOptionalText(input.trackerIssueKey);

  if (trackerIssueId) {
    return await input.issueStore.fetchByTrackerIssueId(trackerIssueId);
  }

  if (!trackerIssueKey) {
    return null;
  }

  if (input.bindingScope) {
    return await input.issueStore.fetchByScopedTrackerIssueKey({
      trackerIssueKey,
      bindingScope: input.bindingScope
    });
  }

  return await input.issueStore.fetchByTrackerIssueKey(trackerIssueKey);
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function collectRepositoryKeys(input: {
  defaultRepositoryKey: string;
  configuredRepositoryKeys: string[];
  cachedRepositoryKeys: string[];
}): string[] {
  return [...new Set([
    input.defaultRepositoryKey,
    ...input.configuredRepositoryKeys,
    ...input.cachedRepositoryKeys
  ])];
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return Number.isInteger(limit) && limit !== undefined && limit > 0
    ? limit
    : fallback;
}

function compareRuntimeLogEntriesDescending(
  left: SymphonyRuntimeLogEntry,
  right: SymphonyRuntimeLogEntry
): number {
  return right.recordedAt.localeCompare(left.recordedAt);
}
