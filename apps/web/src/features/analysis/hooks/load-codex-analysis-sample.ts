import { fetchCodexRunArtifacts } from "@/core/codex-analytics-client";
import { fetchIssueDetail, fetchIssueIndex } from "@/core/forensics-client";
import type {
  SymphonyCodexRunArtifactsResult,
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueListResult
} from "@symphony/contracts";

const ISSUE_SAMPLE_LIMIT = 6;
const RUNS_PER_ISSUE = 2;
const MAX_SAMPLED_RUNS = 12;

export type CodexAnalysisSampleResource = {
  issueIndex: SymphonyForensicsIssueListResult;
  sampledRuns: Array<{
    issueIdentifier: string;
    run: SymphonyForensicsIssueDetailResult["runs"][number];
    artifacts: SymphonyCodexRunArtifactsResult;
  }>;
};

export async function loadCodexAnalysisSample(
  runtimeBaseUrl: string
): Promise<CodexAnalysisSampleResource> {
  const issueIndex = await fetchIssueIndex(runtimeBaseUrl, {
    timeRange: "all",
    sortBy: "lastActive",
    sortDirection: "desc",
    limit: ISSUE_SAMPLE_LIMIT
  });
  const issueDetails = await Promise.all(
    issueIndex.issues.slice(0, ISSUE_SAMPLE_LIMIT).map(async (issue) => {
      try {
        return await fetchIssueDetail(runtimeBaseUrl, issue.issueIdentifier, {
          limit: RUNS_PER_ISSUE
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
            issueIdentifier: detail.issueIdentifier,
            run
          }))
        : []
    )
    .sort((left, right) => right.run.startedAt.localeCompare(left.run.startedAt))
    .slice(0, MAX_SAMPLED_RUNS);
  const artifactResults = await Promise.all(
    sampledRuns.map(async (sampledRun) => {
      try {
        const artifacts = await fetchCodexRunArtifacts(
          runtimeBaseUrl,
          sampledRun.run.runId
        );

        return {
          issueIdentifier: sampledRun.issueIdentifier,
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
