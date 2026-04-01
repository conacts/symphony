import type { SymphonyWorkflowTrackerConfig } from "../workflow/symphony-workflow.js";
import {
  isLinearIssueInScope,
  type SymphonyTracker,
  type SymphonyTrackerIssue
} from "./symphony-tracker.js";
import { normalizeIssueState } from "../workflow/symphony-workflow.js";

const issuePageSize = 50;

const issueFields = `
      id
      identifier
      title
      description
      priority
      state {
        name
      }
      branchName
      url
      team {
        key
      }
      project {
        id
        name
        slugId
      }
      assignee {
        id
      }
      labels {
        nodes {
          name
        }
      }
      inverseRelations(first: $relationFirst) {
        nodes {
          type
          issue {
            id
            identifier
            state {
              name
            }
          }
        }
      }
      createdAt
      updatedAt
`;

const queryByProject = `
query SymphonyLinearPollByProject($projectSlug: String!, $stateNames: [String!]!, $first: Int!, $relationFirst: Int!, $after: String) {
  issues(filter: {project: {slugId: {eq: $projectSlug}}, state: {name: {in: $stateNames}}}, first: $first, after: $after) {
    nodes {
${issueFields}
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

const queryByTeam = `
query SymphonyLinearPollByTeam($teamKey: String!, $stateNames: [String!]!, $first: Int!, $relationFirst: Int!, $after: String) {
  issues(filter: {team: {key: {eq: $teamKey}}, state: {name: {in: $stateNames}}}, first: $first, after: $after) {
    nodes {
${issueFields}
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

const queryByIds = `
query SymphonyLinearIssuesById($ids: [ID!]!, $first: Int!, $relationFirst: Int!) {
  issues(filter: {id: {in: $ids}}, first: $first) {
    nodes {
${issueFields}
    }
  }
}
`;

const queryByIdentifier = `
query SymphonyLinearIssueByIdentifier($id: String!, $relationFirst: Int!) {
  issue(id: $id) {
${issueFields}
  }
}
`;

const viewerQuery = `
query SymphonyLinearViewer {
  viewer {
    id
  }
}
`;

const createCommentMutation = `
mutation SymphonyCreateComment($issueId: String!, $body: String!) {
  commentCreate(input: {issueId: $issueId, body: $body}) {
    success
  }
}
`;

const updateStateMutation = `
mutation SymphonyUpdateIssueState($issueId: String!, $stateId: String!) {
  issueUpdate(id: $issueId, input: {stateId: $stateId}) {
    success
  }
}
`;

const stateLookupQuery = `
query SymphonyResolveStateId($issueId: String!, $stateName: String!) {
  issue(id: $issueId) {
    team {
      states(filter: {name: {eq: $stateName}}, first: 1) {
        nodes {
          id
        }
      }
    }
  }
}
`;

type LinearRequest = (
  query: string,
  variables: Record<string, unknown>,
  config: SymphonyWorkflowTrackerConfig
) => Promise<Record<string, unknown>>;

type LinearAssigneeFilter = {
  configuredAssignee: string;
  matchValues: Set<string>;
} | null;

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

    const response = await this.#request(
      createCommentMutation,
      {
        issueId,
        body
      },
      this.#requiredMutationConfig()
    );

    if (getBooleanPath(response, ["data", "commentCreate", "success"]) !== true) {
      throw new Error("Linear comment creation failed.");
    }
  }

  async updateIssueState(issueId: string, stateName: string): Promise<void> {
    if (issueId.trim() === "" || stateName.trim() === "") {
      throw new TypeError("Tracker issueId and stateName are required.");
    }

    const stateLookup = await this.#request(
      stateLookupQuery,
      {
        issueId,
        stateName
      },
      this.#requiredMutationConfig()
    );
    const stateId = getStringPath(stateLookup, [
      "data",
      "issue",
      "team",
      "states",
      "nodes",
      0,
      "id"
    ]);

    if (!stateId) {
      throw new Error(`Linear state not found for ${stateName}.`);
    }

    const response = await this.#request(
      updateStateMutation,
      {
        issueId,
        stateId
      },
      this.#requiredMutationConfig()
    );

    if (getBooleanPath(response, ["data", "issueUpdate", "success"]) !== true) {
      throw new Error("Linear issue update failed.");
    }
  }

  #requiredMutationConfig(): SymphonyWorkflowTrackerConfig {
    if (this.#config) {
      ensureLinearTrackerConfig(this.#config);
      return this.#config;
    }

    throw new Error("Linear tracker mutations require a configured tracker.");
  }
}

async function fetchIssuesByStates(
  request: LinearRequest,
  config: SymphonyWorkflowTrackerConfig,
  states: string[],
  assigneeFilter: LinearAssigneeFilter
): Promise<SymphonyTrackerIssue[]> {
  const scope = linearScope(config);

  if (!scope) {
    throw new Error("Linear tracker scope is missing.");
  }

  const query = scope.kind === "project" ? queryByProject : queryByTeam;
  const scopeVariables =
    scope.kind === "project"
      ? { projectSlug: scope.value }
      : { teamKey: scope.value };

  let after: string | null = null;
  const issues: SymphonyTrackerIssue[] = [];

  while (true) {
    const body = await request(
      query,
      {
        ...scopeVariables,
        stateNames: states,
        first: issuePageSize,
        relationFirst: issuePageSize,
        after
      },
      config
    );

    if ("errors" in body) {
      throw new Error("Linear GraphQL polling query failed.");
    }

    const issuesNode = getRecordPath(body, ["data", "issues"]);
    const nodes = getArrayPath(issuesNode, ["nodes"]);
    for (const node of nodes) {
      const normalized = normalizeLinearIssue(asRecord(node), assigneeFilter);
      if (normalized) {
        issues.push(normalized);
      }
    }

    const pageInfo = getRecordPath(issuesNode, ["pageInfo"]);
    const hasNextPage = getBooleanPath(pageInfo, ["hasNextPage"]) === true;
    const endCursor = getStringPath(pageInfo, ["endCursor"]);

    if (!hasNextPage) {
      return issues;
    }

    if (!endCursor) {
      throw new Error("Linear pageInfo.endCursor was missing.");
    }

    after = endCursor;
  }
}

async function fetchIssuesByIds(
  request: LinearRequest,
  config: SymphonyWorkflowTrackerConfig,
  issueIds: string[],
  assigneeFilter: LinearAssigneeFilter
): Promise<SymphonyTrackerIssue[]> {
  const orderIndex = new Map(issueIds.map((id, index) => [id, index]));
  const issues: SymphonyTrackerIssue[] = [];

  for (let index = 0; index < issueIds.length; index += issuePageSize) {
    const batch = issueIds.slice(index, index + issuePageSize);
    const body = await request(
      queryByIds,
      {
        ids: batch,
        first: batch.length,
        relationFirst: issuePageSize
      },
      config
    );

    if ("errors" in body) {
      throw new Error("Linear GraphQL issue state refresh failed.");
    }

    const nodes = getArrayPath(getRecordPath(body, ["data", "issues"]), ["nodes"]);
    for (const node of nodes) {
      const normalized = normalizeLinearIssue(asRecord(node), assigneeFilter);
      if (normalized) {
        issues.push(normalized);
      }
    }
  }

  return issues.sort((left, right) => {
    const leftIndex = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

async function resolveAssigneeFilter(
  request: LinearRequest,
  config: SymphonyWorkflowTrackerConfig
): Promise<LinearAssigneeFilter> {
  const assignee = normalizeAssigneeMatchValue(config.assignee);
  if (!assignee) {
    return null;
  }

  if (assignee === "me") {
    const body = await request(viewerQuery, {}, config);
    const viewerId = normalizeAssigneeMatchValue(
      getStringPath(body, ["data", "viewer", "id"])
    );

    if (!viewerId) {
      throw new Error("Linear viewer identity was missing.");
    }

    return {
      configuredAssignee: "me",
      matchValues: new Set([viewerId])
    };
  }

  return {
    configuredAssignee: config.assignee ?? assignee,
    matchValues: new Set([assignee])
  };
}

function normalizeLinearIssue(
  issue: Record<string, unknown> | null,
  assigneeFilter: LinearAssigneeFilter
): SymphonyTrackerIssue | null {
  if (!issue) {
    return null;
  }

  const assignee = getRecord(issue, "assignee");
  const project = getRecord(issue, "project");
  const team = getRecord(issue, "team");

  const id = getString(issue, "id");
  const identifier = getString(issue, "identifier");
  const title = getString(issue, "title");
  const state = getStringPath(issue, ["state", "name"]);

  if (!id || !identifier || !title || !state) {
    return null;
  }

  return {
    id,
    identifier,
    title,
    description: getNullableString(issue, "description"),
    priority: parsePriority(issue.priority),
    state,
    branchName: getNullableString(issue, "branchName"),
    url: getNullableString(issue, "url"),
    projectId: getNullableString(project, "id"),
    projectName: getNullableString(project, "name"),
    projectSlug: getNullableString(project, "slugId"),
    teamKey: getNullableString(team, "key"),
    assigneeId: getNullableString(assignee, "id"),
    blockedBy: extractBlockers(issue),
    labels: extractLabels(issue),
    assignedToWorker: assignedToWorker(assignee, assigneeFilter),
    createdAt: getNullableString(issue, "createdAt"),
    updatedAt: getNullableString(issue, "updatedAt")
  };
}

function extractLabels(issue: Record<string, unknown>): string[] {
  const labels = getArrayPath(getRecordPath(issue, ["labels"]), ["nodes"]);

  return labels
    .map((label) => getNullableString(asRecord(label), "name"))
    .filter((label): label is string => typeof label === "string")
    .map((label) => label.toLowerCase());
}

function extractBlockers(issue: Record<string, unknown>): string[] {
  const inverseRelations = getArrayPath(
    getRecordPath(issue, ["inverseRelations"]),
    ["nodes"]
  );

  return inverseRelations.flatMap((relation) => {
    const relationRecord = asRecord(relation);
    if (!relationRecord) {
      return [];
    }

    const relationType = getNullableString(relationRecord, "type");
    if (normalizeIssueState(relationType) !== "blocks") {
      return [];
    }

    const blockerIssue = getRecord(relationRecord, "issue");
    const blockerId = blockerIssue ? getNullableString(blockerIssue, "id") : null;
    return blockerId ? [blockerId] : [];
  });
}

function assignedToWorker(
  assignee: Record<string, unknown> | null,
  assigneeFilter: LinearAssigneeFilter
): boolean {
  if (!assigneeFilter) {
    return true;
  }

  const assigneeId = normalizeAssigneeMatchValue(getNullableString(assignee, "id"));
  if (!assigneeId) {
    return false;
  }

  return assigneeFilter.matchValues.has(assigneeId);
}

function parsePriority(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function normalizeAssigneeMatchValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

async function requestLinearGraphQL(
  query: string,
  variables: Record<string, unknown>,
  config: SymphonyWorkflowTrackerConfig
): Promise<Record<string, unknown>> {
  ensureLinearTrackerConfig(config);

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: config.apiKey ?? "",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      variables
    })
  });

  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(`Linear GraphQL request failed with ${response.status}.`);
  }

  return body;
}

function ensureLinearTrackerConfig(config: SymphonyWorkflowTrackerConfig): void {
  if (config.kind !== "linear") {
    throw new Error(`Unsupported tracker kind: ${config.kind}`);
  }

  if (!config.apiKey) {
    throw new Error("LINEAR_API_KEY is required for the Linear tracker.");
  }

  if (!linearScope(config)) {
    throw new Error("Linear tracker scope is missing.");
  }
}

function linearScope(
  config: SymphonyWorkflowTrackerConfig
): { kind: "project"; value: string } | { kind: "team"; value: string } | null {
  if (config.teamKey) {
    return {
      kind: "team",
      value: config.teamKey
    };
  }

  if (config.projectSlug) {
    return {
      kind: "project",
      value: config.projectSlug
    };
  }

  return null;
}

function getRecord(
  value: Record<string, unknown> | null | undefined,
  key: string
): Record<string, unknown> | null {
  const nested = value?.[key];
  return asRecord(nested);
}

function getRecordPath(
  value: Record<string, unknown> | null | undefined,
  path: Array<string | number>
): Record<string, unknown> | null {
  const nested = getPath(value, path);
  return asRecord(nested);
}

function getArrayPath(
  value: Record<string, unknown> | null | undefined,
  path: Array<string | number>
): unknown[] {
  const nested = getPath(value, path);
  return Array.isArray(nested) ? nested : [];
}

function getString(
  value: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const nested = value?.[key];
  return typeof nested === "string" && nested.trim() !== "" ? nested : null;
}

function getNullableString(
  value: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  return getString(value, key);
}

function getStringPath(
  value: Record<string, unknown> | null | undefined,
  path: Array<string | number>
): string | null {
  const nested = getPath(value, path);
  return typeof nested === "string" && nested.trim() !== "" ? nested : null;
}

function getBooleanPath(
  value: Record<string, unknown> | null | undefined,
  path: Array<string | number>
): boolean | null {
  const nested = getPath(value, path);
  return typeof nested === "boolean" ? nested : null;
}

function getPath(
  value: Record<string, unknown> | null | undefined,
  path: Array<string | number>
): unknown {
  let current: unknown = value;

  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        return null;
      }

      current = current[segment];
      continue;
    }

    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
