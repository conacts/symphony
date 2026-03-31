import {
  normalizeIssueState,
  type SymphonyWorkflowTrackerConfig
} from "../workflow/symphony-workflow.js";

export const symphonyDisabledLabel = "symphony:disabled";
export const symphonyNoAutoReworkLabel = "symphony:no-auto-rework";

export type SymphonyTrackerIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  projectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  teamKey: string | null;
  assigneeId: string | null;
  blockedBy: string[];
  labels: string[];
  assignedToWorker: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SymphonyTrackerCommentOperation = {
  kind: "comment";
  issueId: string;
  body: string;
};

export type SymphonyTrackerStateUpdateOperation = {
  kind: "update_state";
  issueId: string;
  stateName: string;
};

export type SymphonyTrackerOperation =
  | SymphonyTrackerCommentOperation
  | SymphonyTrackerStateUpdateOperation;

export interface SymphonyTracker {
  fetchCandidateIssues(
    config: SymphonyWorkflowTrackerConfig
  ): Promise<SymphonyTrackerIssue[]>;
  fetchIssuesByStates(
    config: SymphonyWorkflowTrackerConfig,
    states: string[]
  ): Promise<SymphonyTrackerIssue[]>;
  fetchIssueStatesByIds(
    config: SymphonyWorkflowTrackerConfig,
    issueIds: string[]
  ): Promise<SymphonyTrackerIssue[]>;
  fetchIssueByIdentifier(
    config: SymphonyWorkflowTrackerConfig,
    issueIdentifier: string
  ): Promise<SymphonyTrackerIssue | null>;
  createComment(issueId: string, body: string): Promise<void>;
  updateIssueState(issueId: string, stateName: string): Promise<void>;
}

export function issueBranchName(issueIdentifier: string): string {
  return `symphony/${issueIdentifier}`;
}

export function hasSymphonyLabel(
  issue: Pick<SymphonyTrackerIssue, "labels">,
  label: string
): boolean {
  const target = normalizeLabel(label);
  return issue.labels.some((issueLabel) => normalizeLabel(issueLabel) === target);
}

export function isSymphonyWorkflowDisabled(
  issue: Pick<SymphonyTrackerIssue, "labels">
): boolean {
  return hasSymphonyLabel(issue, symphonyDisabledLabel);
}

export function isSymphonyAutoReworkDisabled(
  issue: Pick<SymphonyTrackerIssue, "labels">
): boolean {
  return hasSymphonyLabel(issue, symphonyNoAutoReworkLabel);
}

export function isSymphonyProjectAssigned(
  issue: Pick<SymphonyTrackerIssue, "projectId">
): boolean {
  return typeof issue.projectId === "string" && issue.projectId.trim() !== "";
}

export function linearScope(
  tracker: SymphonyWorkflowTrackerConfig
): { kind: "project"; value: string } | { kind: "team"; value: string } | null {
  if (tracker.teamKey) {
    return {
      kind: "team",
      value: tracker.teamKey
    };
  }

  if (tracker.projectSlug) {
    return {
      kind: "project",
      value: tracker.projectSlug
    };
  }

  return null;
}

export function isLinearIssueInScope(
  tracker: SymphonyWorkflowTrackerConfig,
  issue: SymphonyTrackerIssue
): boolean {
  if (tracker.kind !== "linear") {
    return !isSymphonyWorkflowDisabled(issue);
  }

  if (isSymphonyWorkflowDisabled(issue)) {
    return false;
  }

  const scope = linearScope(tracker);
  if (!scope) {
    return false;
  }

  if (scope.kind === "project") {
    return issue.projectSlug === scope.value;
  }

  return (
    issue.teamKey === scope.value &&
    isSymphonyProjectAssigned(issue) &&
    !tracker.excludedProjectIds.includes(issue.projectId ?? "")
  );
}

export function issueMatchesDispatchableState(
  issue: SymphonyTrackerIssue,
  tracker: SymphonyWorkflowTrackerConfig
): boolean {
  const issueState = normalizeIssueState(issue.state);
  return tracker.dispatchableStates.some(
    (stateName) => normalizeIssueState(stateName) === issueState
  );
}

export function issueMatchesTerminalState(
  issue: SymphonyTrackerIssue,
  tracker: SymphonyWorkflowTrackerConfig
): boolean {
  const issueState = normalizeIssueState(issue.state);
  return tracker.terminalStates.some(
    (stateName) => normalizeIssueState(stateName) === issueState
  );
}

export function createMemorySymphonyTracker(
  issues: SymphonyTrackerIssue[] = []
): MemorySymphonyTracker {
  return new MemorySymphonyTracker(issues);
}

export class MemorySymphonyTracker implements SymphonyTracker {
  readonly #issues = new Map<string, SymphonyTrackerIssue>();
  readonly #operations: SymphonyTrackerOperation[] = [];

  constructor(issues: SymphonyTrackerIssue[] = []) {
    for (const issue of issues) {
      this.#issues.set(issue.id, cloneIssue(issue));
    }
  }

  setIssues(issues: SymphonyTrackerIssue[]): void {
    this.#issues.clear();
    for (const issue of issues) {
      this.#issues.set(issue.id, cloneIssue(issue));
    }
  }

  listOperations(): SymphonyTrackerOperation[] {
    return [...this.#operations];
  }

  getIssue(issueId: string): SymphonyTrackerIssue | null {
    const issue = this.#issues.get(issueId);
    return issue ? cloneIssue(issue) : null;
  }

  async fetchCandidateIssues(
    config: SymphonyWorkflowTrackerConfig
  ): Promise<SymphonyTrackerIssue[]> {
    return this.fetchIssuesByStates(config, config.dispatchableStates);
  }

  async fetchIssuesByStates(
    config: SymphonyWorkflowTrackerConfig,
    states: string[]
  ): Promise<SymphonyTrackerIssue[]> {
    const normalizedStates = new Set(states.map((stateName) => normalizeIssueState(stateName)));

    return [...this.#issues.values()]
      .filter((issue) => normalizedStates.has(normalizeIssueState(issue.state)))
      .filter((issue) => isLinearIssueInScope(config, issue))
      .map((issue) => cloneIssue(issue));
  }

  async fetchIssueStatesByIds(
    _config: SymphonyWorkflowTrackerConfig,
    issueIds: string[]
  ): Promise<SymphonyTrackerIssue[]> {
    return issueIds.flatMap((issueId) => {
      const issue = this.#issues.get(issueId);
      return issue ? [cloneIssue(issue)] : [];
    });
  }

  async fetchIssueByIdentifier(
    _config: SymphonyWorkflowTrackerConfig,
    issueIdentifier: string
  ): Promise<SymphonyTrackerIssue | null> {
    const issue = [...this.#issues.values()].find(
      (entry) => entry.identifier === issueIdentifier
    );

    return issue ? cloneIssue(issue) : null;
  }

  async createComment(issueId: string, body: string): Promise<void> {
    this.#operations.push({
      kind: "comment",
      issueId,
      body
    });
  }

  async updateIssueState(issueId: string, stateName: string): Promise<void> {
    const issue = this.#issues.get(issueId);
    if (!issue) {
      throw new TypeError(`Tracker issue not found: ${issueId}`);
    }

    issue.state = stateName;
    issue.updatedAt = new Date().toISOString();
    this.#operations.push({
      kind: "update_state",
      issueId,
      stateName
    });
  }
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function cloneIssue(issue: SymphonyTrackerIssue): SymphonyTrackerIssue {
  return {
    ...issue,
    blockedBy: [...issue.blockedBy],
    labels: [...issue.labels]
  };
}
