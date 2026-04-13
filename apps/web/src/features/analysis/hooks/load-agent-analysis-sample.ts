import { fetchAgentRunArtifacts } from "@/core/agent-analytics-client";
import { fetchIssueDetail, fetchIssueIndex } from "@/core/forensics-client";
import type {
  SymphonyAgentRunArtifactsResult,
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueListResult
} from "@symphony/contracts";

const ISSUE_SAMPLE_LIMIT = 6;
const RUNS_PER_ISSUE = 2;
const MAX_SAMPLED_RUNS = 12;

export type AgentAnalysisSampleResource = {
  issueIndex: SymphonyForensicsIssueListResult;
  sampledRuns: Array<{
    repositoryKey: string;
    trackerIssueKey: string;
    run: SymphonyForensicsIssueDetailResult["runs"][number];
    artifacts: SymphonyAgentRunArtifactsResult;
  }>;
};

export async function loadAgentAnalysisSample(
  runtimeBaseUrl: string,
  input: {
    repo?: string;
  } = {}
): Promise<AgentAnalysisSampleResource> {
  const issueIndex = await fetchIssueIndex(runtimeBaseUrl, {
    repo: input.repo,
    timeRange: "all",
    sortBy: "lastActive",
    sortDirection: "desc",
    limit: ISSUE_SAMPLE_LIMIT
  });
  const issueDetails = await Promise.all(
    issueIndex.issues.slice(0, ISSUE_SAMPLE_LIMIT).map(async (issue) => {
      try {
        return await fetchIssueDetail(runtimeBaseUrl, issue.trackerIssueKey, {
          limit: RUNS_PER_ISSUE,
          repo: issue.repositoryKey
        });
      } catch {
        return null;
      }
    })
  );
  const sampledRuns = issueDetails
    .flatMap((detail) =>
      detail
        ? detail.runs.map((run) => ({
            repositoryKey: detail.repositoryKey,
            trackerIssueKey: detail.trackerIssueKey,
            run
          }))
        : []
    )
    .sort((left, right) => right.run.startedAt.localeCompare(left.run.startedAt))
    .slice(0, MAX_SAMPLED_RUNS);
  const artifactResults = await Promise.all(
    sampledRuns.map(async (sampledRun) => {
      try {
        const artifacts = await fetchAgentRunArtifacts(
          runtimeBaseUrl,
          sampledRun.run.runId
        );

        return {
          repositoryKey: sampledRun.repositoryKey,
          trackerIssueKey: sampledRun.trackerIssueKey,
          run: sampledRun.run,
          artifacts
        };
      } catch {
        return null;
      }
    })
  );

  return {
    issueIndex,
    sampledRuns: artifactResults.filter((entry) => entry !== null)
  };
}
