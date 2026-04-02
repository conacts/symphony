export const issuePageSize = 50;

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

export const queryByProject = `
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

export const queryByTeam = `
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

export const queryByIds = `
query SymphonyLinearIssuesById($ids: [ID!]!, $first: Int!, $relationFirst: Int!) {
  issues(filter: {id: {in: $ids}}, first: $first) {
    nodes {
${issueFields}
    }
  }
}
`;

export const queryByIdentifier = `
query SymphonyLinearIssueByIdentifier($id: String!, $relationFirst: Int!) {
  issue(id: $id) {
${issueFields}
  }
}
`;

export const viewerQuery = `
query SymphonyLinearViewer {
  viewer {
    id
  }
}
`;

export const createCommentMutation = `
mutation SymphonyCreateComment($issueId: String!, $body: String!) {
  commentCreate(input: {issueId: $issueId, body: $body}) {
    success
  }
}
`;

export const updateStateMutation = `
mutation SymphonyUpdateIssueState($issueId: String!, $stateId: String!) {
  issueUpdate(id: $issueId, input: {stateId: $stateId}) {
    success
  }
}
`;

export const stateLookupQuery = `
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
