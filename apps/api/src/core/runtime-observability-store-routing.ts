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
      repositoryKey
    });
    storeCache.set(repositoryKey, store);
    return store;
  };
  const defaultStore = storeFor(input.defaultRepositoryKey);

  return {
    async record(recordInput) {
      const store =
        (await resolveIssueTimelineStoreForIssueIdentifier({
          issueStore: input.issueStore,
          bindingScope: input.bindingScope ?? null,
          issueIdentifier: recordInput.issueIdentifier,
          defaultStore,
          storeFor
        })) ?? defaultStore;

      return await store.record(recordInput);
    },

    async listIssueTimeline(issueIdentifier, query) {
      const store =
        (await resolveIssueTimelineStoreForIssueIdentifier({
          issueStore: input.issueStore,
          bindingScope: input.bindingScope ?? null,
          issueIdentifier,
          defaultStore,
          storeFor
        })) ?? defaultStore;

      return await store.listIssueTimeline(issueIdentifier, query);
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
      repositoryKey
    });
    storeCache.set(repositoryKey, store);
    return store;
  };
  const defaultStore = storeFor(input.defaultRepositoryKey);

  return {
    async record(recordInput) {
      if (recordInput.issueIdentifier === undefined || recordInput.issueIdentifier === null) {
        return await defaultStore.record(recordInput);
      }

      const store =
        (await resolveRuntimeLogStoreForIssueIdentifier({
          issueStore: input.issueStore,
          bindingScope: input.bindingScope ?? null,
          issueIdentifier: recordInput.issueIdentifier,
          defaultStore,
          storeFor
        })) ?? defaultStore;

      return await store.record(recordInput);
    },

    async list(query = {}) {
      if (query.issueIdentifier) {
        const store =
          (await resolveRuntimeLogStoreForIssueIdentifier({
            issueStore: input.issueStore,
            bindingScope: input.bindingScope ?? null,
            issueIdentifier: query.issueIdentifier,
            defaultStore,
            storeFor
          })) ?? defaultStore;

        return await store.list(query);
      }

      const limit = normalizeLimit(query.limit, 200);
      const repositoryKeys = collectRepositoryKeys({
        defaultRepositoryKey: input.defaultRepositoryKey,
        configuredRepositoryKeys: input.repositoryKeys ?? [],
        cachedRepositoryKeys: [...storeCache.keys()]
      });
      const entries = (
        await Promise.all(
          repositoryKeys.map((repositoryKey) =>
            storeFor(repositoryKey).list({
              limit
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

async function resolveIssueTimelineStoreForIssueIdentifier(input: {
  issueStore: SymphonyIssueStore;
  bindingScope: SymphonyLifecycleBindingScope | null;
  issueIdentifier: string;
  defaultStore: SymphonyIssueTimelineStore;
  storeFor(repositoryKey: string): SymphonyIssueTimelineStore;
}): Promise<SymphonyIssueTimelineStore | null> {
  const issue = await loadIssueRecord({
    issueStore: input.issueStore,
    bindingScope: input.bindingScope,
    issueIdentifier: input.issueIdentifier
  });
  if (!issue) {
    return input.defaultStore;
  }

  return input.storeFor(issue.repositoryKey);
}

async function resolveRuntimeLogStoreForIssueIdentifier(input: {
  issueStore: SymphonyIssueStore;
  bindingScope: SymphonyLifecycleBindingScope | null;
  issueIdentifier: string;
  defaultStore: SymphonyRuntimeLogStore;
  storeFor(repositoryKey: string): SymphonyRuntimeLogStore;
}): Promise<SymphonyRuntimeLogStore | null> {
  const issue = await loadIssueRecord({
    issueStore: input.issueStore,
    bindingScope: input.bindingScope,
    issueIdentifier: input.issueIdentifier
  });
  if (!issue) {
    return input.defaultStore;
  }

  return input.storeFor(issue.repositoryKey);
}

async function loadIssueRecord(input: {
  issueStore: SymphonyIssueStore;
  bindingScope: SymphonyLifecycleBindingScope | null;
  issueIdentifier: string;
}) {
  if (input.bindingScope) {
    return await input.issueStore.fetchByScopedIdentifier({
      issueIdentifier: input.issueIdentifier,
      bindingScope: input.bindingScope
    });
  }

  return await input.issueStore.fetchByIdentifier(input.issueIdentifier);
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
