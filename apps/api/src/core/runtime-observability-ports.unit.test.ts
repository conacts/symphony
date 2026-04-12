import { describe, expect, it, vi } from "vitest";
import type { SymphonyIssueStore, SymphonyIssueTimelineStore } from "@symphony/db";
import { createIssueTimelinePort } from "./runtime-observability-ports.js";

describe("runtime observability ports", () => {
  it("uses scoped issue lookup for issue timeline reads when a binding scope is configured", async () => {
    const fetchByIdentifier = vi.fn();
    const fetchByScopedIdentifier = vi.fn().mockResolvedValue({
      repositoryKey: "repo-secondary"
    });
    const listIssueTimeline = vi.fn().mockResolvedValue([]);

    const port = createIssueTimelinePort({
      issueTimelineStore: createIssueTimelineStoreDouble({
        listIssueTimeline
      }),
      issueStore: createIssueStoreDouble({
        fetchByIdentifier,
        fetchByScopedIdentifier
      }),
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "ws-1"
      }
    });

    const result = await port.list({
      issueIdentifier: "SYM-420",
      limit: 25
    });

    expect(fetchByScopedIdentifier).toHaveBeenCalledWith({
      issueIdentifier: "SYM-420",
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "ws-1"
      }
    });
    expect(fetchByIdentifier).not.toHaveBeenCalled();
    expect(listIssueTimeline).toHaveBeenCalledWith("SYM-420", {
      limit: 25
    });
    expect(result).toEqual({
      repositoryKey: "repo-secondary",
      issueIdentifier: "SYM-420",
      entries: [],
      filters: {
        limit: 25,
        repo: null
      }
    });
  });

  it("keeps unscoped issue lookup for issue timeline reads when no binding scope is configured", async () => {
    const fetchByIdentifier = vi.fn().mockResolvedValue({
      repositoryKey: "repo-primary"
    });
    const fetchByScopedIdentifier = vi.fn();

    const port = createIssueTimelinePort({
      issueTimelineStore: createIssueTimelineStoreDouble({
        listIssueTimeline: vi.fn().mockResolvedValue([])
      }),
      issueStore: createIssueStoreDouble({
        fetchByIdentifier,
        fetchByScopedIdentifier
      })
    });

    await port.list({
      issueIdentifier: "SYM-421"
    });

    expect(fetchByIdentifier).toHaveBeenCalledWith("SYM-421");
    expect(fetchByScopedIdentifier).not.toHaveBeenCalled();
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
  fetchByIdentifier: SymphonyIssueStore["fetchByIdentifier"];
  fetchByScopedIdentifier: SymphonyIssueStore["fetchByScopedIdentifier"];
}): SymphonyIssueStore {
  return {
    fetchByIdentifier: input.fetchByIdentifier,
    fetchByTrackerIssueId: vi.fn(),
    fetchByScopedIdentifier: input.fetchByScopedIdentifier,
    upsert: vi.fn()
  };
}
