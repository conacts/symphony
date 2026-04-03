import type {
  SymphonyIssueTimelinePort,
  SymphonyRuntimeHealthPort,
  SymphonyRuntimeLogsPort,
  RuntimeHealthPortInput
} from "./runtime-app-types.js";
import type {
  SymphonyIssueTimelineStore,
  SymphonyRuntimeLogStore
} from "@symphony/db";

export function createIssueTimelinePort(input: {
  issueTimelineStore: SymphonyIssueTimelineStore;
}): SymphonyIssueTimelinePort {
  return {
    async list({ issueIdentifier, limit }) {
      const entries = await input.issueTimelineStore.listIssueTimeline(
        issueIdentifier,
        {
          limit
        }
      );

      return entries.length === 0
        ? null
        : {
            issueIdentifier,
            entries,
            filters: {
              limit: limit ?? null
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
      const logs = await input.runtimeLogStore.list(query);

      return {
        logs,
        filters: {
          limit: query.limit ?? null,
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
          buildIdlePollerSnapshot(input.runtimePolicy.polling.intervalMs)
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
