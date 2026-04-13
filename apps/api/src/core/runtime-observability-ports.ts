import type {
  SymphonyIssueTimelinePort,
  SymphonyRuntimeHealthPort,
  SymphonyRuntimeLogsPort,
  RuntimeHealthPortInput
} from "./runtime-app-types.js";
import type { SymphonyRuntimePersistedWorkspaceBindingScope } from "./runtime-bootstrap-contract.js";
import type {
  SymphonyIssueTimelineStore,
  SymphonyIssueStore,
  SymphonyRuntimeLogStore
} from "@symphony/db";

export function createIssueTimelinePort(input: {
  issueTimelineStore: SymphonyIssueTimelineStore;
  issueStore: SymphonyIssueStore;
  bindingScope?: SymphonyRuntimePersistedWorkspaceBindingScope | null;
}): SymphonyIssueTimelinePort {
  return {
    async list({ issueIdentifier, limit, repo }) {
      const issue = input.bindingScope
        ? await input.issueStore.fetchByScopedIdentifier({
            issueIdentifier,
            bindingScope: input.bindingScope
          })
        : await input.issueStore.fetchByIdentifier(issueIdentifier);
      if (!issue) {
        return null;
      }

      if (repo && issue.repositoryKey !== repo) {
        return null;
      }

      const entries = await input.issueTimelineStore.listIssueTimeline(issueIdentifier, {
        limit
      });

      return {
        repositoryKey: issue.repositoryKey,
        trackerIssueKey: issueIdentifier,
        entries: entries.map(mapTrackerIssueKeyField),
        filters: {
          limit: limit ?? null,
          repo: repo ?? null
        }
      };
    }
  };
}

export function createRuntimeLogsPort(input: {
  runtimeLogStore: SymphonyRuntimeLogStore;
}): SymphonyRuntimeLogsPort {
  return {
    async list(query = {}) {
      const logs = await input.runtimeLogStore.list({
        limit: query.limit,
        repo: query.repo,
        issueIdentifier: query.issueIdentifier
      });

      return {
        logs: logs.map(mapNullableTrackerIssueKeyField),
        filters: {
          limit: query.limit ?? null,
          repo: logs[0]?.repositoryKey ?? query.repo ?? null,
          trackerIssueKey: query.issueIdentifier ?? null
        }
      };
    }
  };
}

export function createRuntimeHealthPort(
  input: RuntimeHealthPortInput
): SymphonyRuntimeHealthPort {
  return {
    snapshot() {
      const pollSchedulerSnapshot = input.readPollSchedulerSnapshot();

      return {
        healthy: (pollSchedulerSnapshot?.lastError ?? null) === null,
        db: {
          file: input.dbFile,
          ready: true
        },
        poller:
          pollSchedulerSnapshot ??
          buildIdlePollerSnapshot(input.runtimePolicy.polling.intervalMs),
        machineLoad: input.readMachineLoadSnapshot()
      };
    }
  };
}

function buildIdlePollerSnapshot(intervalMs: number) {
  return {
    running: false,
    intervalMs,
    inFlight: false,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastSucceededAt: null,
    lastError: null
  };
}

function mapTrackerIssueKeyField<T extends { issueIdentifier: string }>(
  input: T
): Omit<T, "issueIdentifier"> & { trackerIssueKey: string } {
  const { issueIdentifier, ...rest } = input;
  return {
    ...rest,
    trackerIssueKey: issueIdentifier
  };
}

function mapNullableTrackerIssueKeyField<T extends { issueIdentifier: string | null }>(
  input: T
): Omit<T, "issueIdentifier"> & { trackerIssueKey: string | null } {
  const { issueIdentifier, ...rest } = input;
  return {
    ...rest,
    trackerIssueKey: issueIdentifier
  };
}
