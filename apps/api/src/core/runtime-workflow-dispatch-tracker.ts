import type {
  SymphonyTracker,
  SymphonyTrackerConfig,
  SymphonyTrackerIssue
} from "@symphony/tracker";

export function createWorkflowDispatchTracker(input: {
  tracker: SymphonyTracker;
}): SymphonyTracker {
  return {
    async fetchCandidateIssues(
      _config: SymphonyTrackerConfig
    ): Promise<SymphonyTrackerIssue[]> {
      void _config;
      // Workflow-authoritative dispatch is driven by explicit tracker ingress.
      // Candidate discovery must stay empty so the poll loop cannot reintroduce
      // tracker-side lifecycle authority.
      return [];
    },

    async fetchIssuesByStates(
      config: SymphonyTrackerConfig,
      states: string[]
    ): Promise<SymphonyTrackerIssue[]> {
      return await input.tracker.fetchIssuesByStates(config, states);
    },

    async fetchIssueStatesByIds(
      config: SymphonyTrackerConfig,
      issueIds: string[]
    ): Promise<SymphonyTrackerIssue[]> {
      return await input.tracker.fetchIssueStatesByIds(config, issueIds);
    },

    async fetchIssueByIdentifier(
      config: SymphonyTrackerConfig,
      issueIdentifier: string
    ): Promise<SymphonyTrackerIssue | null> {
      return await input.tracker.fetchIssueByIdentifier(config, issueIdentifier);
    },

    async createComment(issueId: string, body: string): Promise<void> {
      await input.tracker.createComment(issueId, body);
    },

    async updateIssueState(issueId: string, stateName: string): Promise<void> {
      await input.tracker.updateIssueState(issueId, stateName);
    }
  };
}
