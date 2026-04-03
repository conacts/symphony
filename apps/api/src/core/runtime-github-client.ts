import type { SymphonyLogger } from "@symphony/logger";

export async function fetchGitHubPullRequestMetadata(
  pullRequestUrl: string,
  apiToken: string | null,
  logger: SymphonyLogger
): Promise<{ headRef: string | null; htmlUrl: string | null } | null> {
  try {
    const response = await fetch(pullRequestUrl, {
      headers: buildGitHubRequestHeaders(apiToken)
    });

    if (!response.ok) {
      logger.warn("Failed to fetch GitHub pull request metadata", {
        pullRequestUrl,
        status: response.status
      });
      return null;
    }

    const payload = (await response.json()) as {
      head?: { ref?: unknown };
      html_url?: unknown;
    };

    return {
      headRef: typeof payload.head?.ref === "string" ? payload.head.ref : null,
      htmlUrl: typeof payload.html_url === "string" ? payload.html_url : null
    };
  } catch (error) {
    logger.warn("GitHub pull request lookup failed", {
      pullRequestUrl,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function createGitHubIssueComment(input: {
  repository: string;
  issueNumber: number;
  body: string;
  apiToken: string | null;
  logger: SymphonyLogger;
}): Promise<void> {
  if (!input.apiToken) {
    return;
  }

  const endpoint = `https://api.github.com/repos/${input.repository}/issues/${input.issueNumber}/comments`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...buildGitHubRequestHeaders(input.apiToken),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        body: input.body
      })
    });

    if (!response.ok) {
      input.logger.warn("Failed to create GitHub acknowledgement comment", {
        repository: input.repository,
        issueNumber: input.issueNumber,
        status: response.status
      });
    }
  } catch (error) {
    input.logger.warn("GitHub acknowledgement comment failed", {
      repository: input.repository,
      issueNumber: input.issueNumber,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function buildGitHubRequestHeaders(
  apiToken: string | null
): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    "user-agent": "symphony-runtime",
    ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {})
  };
}
