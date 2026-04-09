import { describe, expect, it } from "vitest";
import {
  buildAnalysisFilterOptions,
  countSampledIssues,
  filterAgentAnalysisSample
} from "@/features/analysis/model/analysis-sample-filter";
import {
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsIssueDetailResult,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";
import type { AgentAnalysisSampleResource } from "@/features/analysis/hooks/load-agent-analysis-sample";

describe("analysis sample filter", () => {
  it("filters sampled runs by harness, provider, and model while exposing option facets", () => {
    const resource: AgentAnalysisSampleResource = {
      issueIndex: buildSymphonyForensicsIssueListResult(),
      sampledRuns: [
        {
          repositoryKey: "symphony",
          issueIdentifier: "COL-165",
          run: buildSymphonyForensicsIssueDetailResult().runs[0]!,
          artifacts: buildSymphonyAgentRunArtifactsResult()
        },
        {
          repositoryKey: "symphony",
          issueIdentifier: "COL-166",
          run: {
            ...buildSymphonyForensicsIssueDetailResult().runs[0]!,
            runId: "run_456",
            trackerIssueId: "issue_456",
            issueIdentifier: "COL-166",
            agentHarness: "pi",
            model: "gpt-5.4"
          },
          artifacts: buildSymphonyAgentRunArtifactsResult({
            run: {
              ...buildSymphonyAgentRunArtifactsResult().run,
              runId: "run_456",
              trackerIssueId: "issue_456",
              issueIdentifier: "COL-166",
              harnessKind: "pi",
              providerId: "openai",
              providerName: "OpenAI",
              model: "gpt-5.4"
            }
          })
        }
      ]
    };
    resource.sampledRuns[0]!.run.agentHarness = "pi";
    resource.sampledRuns[0]!.artifacts.run.harnessKind = "pi";

    const filtered = filterAgentAnalysisSample(resource, {
      harness: "pi",
      provider: "openai",
      model: "gpt-5.4"
    });
    const options = buildAnalysisFilterOptions(resource);

    expect(filtered.sampledRuns).toHaveLength(1);
    expect(filtered.sampledRuns[0]?.issueIdentifier).toBe("COL-166");
    expect(countSampledIssues(filtered)).toBe(1);
    expect(options.harnesses.map((option) => option.label)).toEqual([
      "PI"
    ]);
    expect(options.providers.map((option) => option.label)).toEqual([
      "OpenAI",
      "OpenRouter"
    ]);
  });
});
