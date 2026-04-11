import type {
  SymphonyIssueTimelinePort,
  SymphonyRuntimeHealthPort,
  SymphonyRuntimeLogsPort,
  RuntimeHealthPortInput
} from "./runtime-app-types.js";
import type {
  SymphonyIssueTimelineStore,
  SymphonyIssueStore,
  SymphonyRuntimeLogStore
} from "@symphony/db";

export function createIssueTimelinePort(input: {
  issueTimelineStore: SymphonyIssueTimelineStore;
  issueStore: SymphonyIssueStore;
}): SymphonyIssueTimelinePort {
  return {
    async list({ issueIdentifier, limit, repo }) {
      const issue = await input.issueStore.fetchByIdentifier(issueIdentifier);
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
        issueIdentifier,
        entries,
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
        issueIdentifier: query.issueIdentifier
      });

      return {
        logs,
        filters: {
          limit: query.limit ?? null,
          repo: logs[0]?.repositoryKey ?? query.repo ?? null,
          issueIdentifier: query.issueIdentifier ?? null
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
