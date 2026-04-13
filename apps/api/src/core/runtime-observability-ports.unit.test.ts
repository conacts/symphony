import { describe, expect, it, vi } from "vitest";
import type {
  SymphonyIssueStore,
  SymphonyIssueTimelineStore,
  SymphonyRuntimeLogStore
} from "@symphony/db";
import {
  createIssueTimelinePort,
  createRuntimeLogsPort
} from "./runtime-observability-ports.js";

describe("runtime observability ports", () => {
  it("uses scoped issue lookup for issue timeline reads when a binding scope is configured", async () => {
    const fetchByTrackerIssueKey = vi.fn();
    const fetchByScopedTrackerIssueKey = vi.fn().mockResolvedValue({
      repositoryKey: "repo-secondary"
    });
    const listIssueTimeline = vi.fn().mockResolvedValue([]);

    const port = createIssueTimelinePort({
      issueTimelineStore: createIssueTimelineStoreDouble({
        listIssueTimeline
      }),
      issueStore: createIssueStoreDouble({
        fetchByTrackerIssueKey,
        fetchByScopedTrackerIssueKey
      }),
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "ws-1"
      }
    });

    const result = await port.list({
      trackerIssueKey: "SYM-420",
      limit: 25
    });

    expect(fetchByScopedTrackerIssueKey).toHaveBeenCalledWith({
      trackerIssueKey: "SYM-420",
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "ws-1"
      }
    });
    expect(fetchByTrackerIssueKey).not.toHaveBeenCalled();
    expect(listIssueTimeline).toHaveBeenCalledWith("SYM-420", {
      limit: 25
    });
    expect(result).toEqual({
      repositoryKey: "repo-secondary",
      trackerIssueKey: "SYM-420",
      entries: [],
      filters: {
        limit: 25,
        repo: null
      }
    });
  });

  it("keeps unscoped issue lookup for issue timeline reads when no binding scope is configured", async () => {
    const fetchByTrackerIssueKey = vi.fn().mockResolvedValue({
      repositoryKey: "repo-primary"
    });
    const fetchByScopedTrackerIssueKey = vi.fn();

    const port = createIssueTimelinePort({
      issueTimelineStore: createIssueTimelineStoreDouble({
        listIssueTimeline: vi.fn().mockResolvedValue([])
      }),
      issueStore: createIssueStoreDouble({
        fetchByTrackerIssueKey,
        fetchByScopedTrackerIssueKey
      })
    });

    await port.list({
      trackerIssueKey: "SYM-421"
    });

    expect(fetchByTrackerIssueKey).toHaveBeenCalledWith("SYM-421");
    expect(fetchByScopedTrackerIssueKey).not.toHaveBeenCalled();
  });

  it("forwards repository filters when listing runtime logs", async () => {
    const list = vi.fn().mockResolvedValue([]);

    const port = createRuntimeLogsPort({
      runtimeLogStore: createRuntimeLogStoreDouble({
        list
      })
    });

    const result = await port.list({
      limit: 50,
      repo: "repo-secondary",
      trackerIssueKey: "SYM-422"
    });

    expect(list).toHaveBeenCalledWith({
      limit: 50,
      repo: "repo-secondary",
      trackerIssueKey: "SYM-422"
    });
    expect(result).toEqual({
      logs: [],
      filters: {
        limit: 50,
        repo: "repo-secondary",
        trackerIssueKey: "SYM-422"
      }
    });
  });
});

function createIssueTimelineStoreDouble(input: {
  listIssueTimeline: SymphonyIssueTimelineStore["listIssueTimeline"];
}): SymphonyIssueTimelineStore {
  return {
    record: vi.fn(),
    listIssueTimeline: input.listIssueTimeline
  };
}

function createIssueStoreDouble(input: {
  fetchByTrackerIssueKey: SymphonyIssueStore["fetchByTrackerIssueKey"];
  fetchByScopedTrackerIssueKey: SymphonyIssueStore["fetchByScopedTrackerIssueKey"];
}): SymphonyIssueStore {
  return {
    fetchByTrackerIssueKey: input.fetchByTrackerIssueKey,
    fetchByTrackerIssueId: vi.fn(),
    fetchByScopedTrackerIssueKey: input.fetchByScopedTrackerIssueKey,
    upsert: vi.fn()
  };
}

function createRuntimeLogStoreDouble(input: {
  list: SymphonyRuntimeLogStore["list"];
}): SymphonyRuntimeLogStore {
  return {
    record: vi.fn(),
    list: input.list
  };
}
