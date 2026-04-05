import { describe, expect, it } from "vitest";
import {
  buildAnalysisFilterOptions,
  countSampledIssues,
  filterCodexAnalysisSample
} from "@/features/analysis/model/analysis-sample-filter";
import {
  buildSymphonyCodexRunArtifactsResult,
  buildSymphonyForensicsIssueDetailResult,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("analysis sample filter", () => {
  it("filters sampled runs by harness, provider, and model while exposing option facets", () => {
    const resource = {
      issueIndex: buildSymphonyForensicsIssueListResult(),
      sampledRuns: [
        {
          issueIdentifier: "COL-165",
          run: buildSymphonyForensicsIssueDetailResult().runs[0]!,
          artifacts: buildSymphonyCodexRunArtifactsResult()
        },
        {
          issueIdentifier: "COL-166",
          run: {
            ...buildSymphonyForensicsIssueDetailResult().runs[0]!,
            runId: "run_456",
            issueId: "issue_456",
            issueIdentifier: "COL-166",
            agentHarness: "opencode",
            codexModel: "gpt-5.4"
          },
          artifacts: buildSymphonyCodexRunArtifactsResult({
            run: {
              ...buildSymphonyCodexRunArtifactsResult().run,
              runId: "run_456",
              issueId: "issue_456",
              issueIdentifier: "COL-166",
              harnessKind: "opencode",
              providerId: "openai",
              providerName: "OpenAI",
              model: "gpt-5.4"
            }
          })
        }
      ]
    };

    const filtered = filterCodexAnalysisSample(resource, {
      harness: "opencode",
      provider: "openai",
      model: "gpt-5.4"
    });
    const options = buildAnalysisFilterOptions(resource);

    expect(filtered.sampledRuns).toHaveLength(1);
    expect(filtered.sampledRuns[0]?.issueIdentifier).toBe("COL-166");
    expect(countSampledIssues(filtered)).toBe(1);
    expect(options.harnesses.map((option) => option.label)).toEqual([
      "Codex",
      "OpenCode"
    ]);
    expect(options.providers.map((option) => option.label)).toEqual([
      "OpenAI",
      "OpenRouter"
    ]);
  });
});
