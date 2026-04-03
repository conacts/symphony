import {
  asRecord,
  getArrayPath,
  getBooleanPath,
  getRecordPath,
  getStringPath
} from "./internal-records.js";
import {
  linearScope,
  type SymphonyTrackerIssue
} from "./symphony-tracker.js";
import {
  issuePageSize,
  queryByIds,
  queryByProject,
  queryByTeam,
  stateLookupQuery,
  updateStateMutation,
  viewerQuery,
  createCommentMutation
} from "./linear-symphony-tracker-queries.js";
import {
  normalizeAssigneeMatchValue,
  normalizeLinearIssue,
  type LinearAssigneeFilter
} from "./linear-symphony-tracker-normalization.js";
import type { SymphonyTrackerConfig } from "./tracker-config.js";

export type LinearRequest = (
  query: string,
  variables: Record<string, unknown>,
  config: SymphonyTrackerConfig
) => Promise<Record<string, unknown>>;

export async function fetchIssuesByStates(
  request: LinearRequest,
  config: SymphonyTrackerConfig,
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

export async function fetchIssuesByIds(
  request: LinearRequest,
  config: SymphonyTrackerConfig,
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

export async function resolveAssigneeFilter(
  request: LinearRequest,
  config: SymphonyTrackerConfig
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

export async function createLinearComment(
  request: LinearRequest,
  config: SymphonyTrackerConfig,
  issueId: string,
  body: string
): Promise<void> {
  const response = await request(
    createCommentMutation,
    {
      issueId,
      body
    },
    config
  );

  if (getBooleanPath(response, ["data", "commentCreate", "success"]) !== true) {
    throw new Error("Linear comment creation failed.");
  }
}

export async function updateLinearIssueState(
  request: LinearRequest,
  config: SymphonyTrackerConfig,
  issueId: string,
  stateName: string
): Promise<void> {
  const stateLookup = await request(
    stateLookupQuery,
    {
      issueId,
      stateName
    },
    config
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

  const response = await request(
    updateStateMutation,
    {
      issueId,
      stateId
    },
    config
  );

  if (getBooleanPath(response, ["data", "issueUpdate", "success"]) !== true) {
    throw new Error("Linear issue update failed.");
  }
}

export async function requestLinearGraphQL(
  query: string,
  variables: Record<string, unknown>,
  config: SymphonyTrackerConfig
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

  const body = asRecord(await response.json());

  if (!response.ok) {
    throw new Error(`Linear GraphQL request failed with ${response.status}.`);
  }

  if (!body) {
    throw new Error("Linear GraphQL response must decode to an object.");
  }

  return body;
}

export function ensureLinearTrackerConfig(
  config: SymphonyTrackerConfig
): void {
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
