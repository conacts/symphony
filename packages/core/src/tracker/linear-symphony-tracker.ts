import type { SymphonyWorkflowTrackerConfig } from "../workflow/symphony-workflow.js";
import {
  isLinearIssueInScope,
  type SymphonyTracker,
  type SymphonyTrackerIssue
} from "./symphony-tracker.js";
import { getRecord } from "../internal/records.js";
import { queryByIdentifier, issuePageSize } from "./linear-symphony-tracker-queries.js";
import {
  normalizeLinearIssue
} from "./linear-symphony-tracker-normalization.js";
import {
  createLinearComment,
  ensureLinearTrackerConfig,
  fetchIssuesByIds,
  fetchIssuesByStates,
  requestLinearGraphQL,
  resolveAssigneeFilter,
  updateLinearIssueState,
  type LinearRequest
} from "./linear-symphony-tracker-operations.js";

export function createLinearSymphonyTracker(input: {
  request?: LinearRequest;
  config?: SymphonyWorkflowTrackerConfig;
} = {}): SymphonyTracker {
  return new LinearSymphonyTracker(
    input.request ?? requestLinearGraphQL,
    input.config ?? null
  );
}

class LinearSymphonyTracker implements SymphonyTracker {
  readonly #request: LinearRequest;
  readonly #config: SymphonyWorkflowTrackerConfig | null;

  constructor(
    request: LinearRequest,
    config: SymphonyWorkflowTrackerConfig | null
  ) {
    this.#request = request;
    this.#config = config;
  }

  async fetchCandidateIssues(
    config: SymphonyWorkflowTrackerConfig
  ): Promise<SymphonyTrackerIssue[]> {
    ensureLinearTrackerConfig(config);
    const assigneeFilter = await resolveAssigneeFilter(this.#request, config);
    const issues = await fetchIssuesByStates(
      this.#request,
      config,
      config.dispatchableStates,
      assigneeFilter
    );
    return issues.filter((issue) => isLinearIssueInScope(config, issue));
  }

  async fetchIssuesByStates(
    config: SymphonyWorkflowTrackerConfig,
    states: string[]
  ): Promise<SymphonyTrackerIssue[]> {
    ensureLinearTrackerConfig(config);
    if (states.length === 0) {
      return [];
    }

    const issues = await fetchIssuesByStates(
      this.#request,
      config,
      [...new Set(states)],
      null
    );
    return issues.filter((issue) => isLinearIssueInScope(config, issue));
  }

  async fetchIssueStatesByIds(
    config: SymphonyWorkflowTrackerConfig,
    issueIds: string[]
  ): Promise<SymphonyTrackerIssue[]> {
    ensureLinearTrackerConfig(config);
    const ids = [...new Set(issueIds)];
    if (ids.length === 0) {
      return [];
    }

    const assigneeFilter = await resolveAssigneeFilter(this.#request, config);
    const issues = await fetchIssuesByIds(
      this.#request,
      config,
      ids,
      assigneeFilter
    );
    return issues.filter((issue) => isLinearIssueInScope(config, issue));
  }

  async fetchIssueByIdentifier(
    config: SymphonyWorkflowTrackerConfig,
    issueIdentifier: string
  ): Promise<SymphonyTrackerIssue | null> {
    ensureLinearTrackerConfig(config);
    const identifier = issueIdentifier.trim();

    if (identifier === "") {
      return null;
    }

    const body = await this.#request(
      queryByIdentifier,
      {
        id: identifier,
        relationFirst: issuePageSize
      },
      config
    );

    if ("errors" in body) {
      throw new Error("Linear GraphQL issue lookup failed.");
    }

    const issue = normalizeLinearIssue(
      getRecord(body, "data") ? getRecord(getRecord(body, "data"), "issue") : null,
      null
    );

    if (!issue || !isLinearIssueInScope(config, issue)) {
      return null;
    }

    return issue;
  }

  async createComment(issueId: string, body: string): Promise<void> {
    if (issueId.trim() === "" || body.trim() === "") {
      throw new TypeError("Tracker issueId and comment body are required.");
    }

    await createLinearComment(
      this.#request,
      this.#requiredMutationConfig(),
      issueId,
      body
    );
  }

  async updateIssueState(issueId: string, stateName: string): Promise<void> {
    if (issueId.trim() === "" || stateName.trim() === "") {
      throw new TypeError("Tracker issueId and stateName are required.");
    }

    await updateLinearIssueState(
      this.#request,
      this.#requiredMutationConfig(),
      issueId,
      stateName
    );
  }

  #requiredMutationConfig(): SymphonyWorkflowTrackerConfig {
    if (this.#config) {
      ensureLinearTrackerConfig(this.#config);
      return this.#config;
    }

    throw new Error("Linear tracker mutations require a configured tracker.");
  }
}
