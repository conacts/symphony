import type { FailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import type { TokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";

export type AnalysisOverviewViewModel = {
  cards: Array<{
    href: string;
    title: string;
    description: string;
    primaryLabel: string;
    primaryValue: string;
    primaryDetail: string;
    secondaryLabel: string;
    secondaryValue: string;
    secondaryDetail: string;
  }>;
};

export function buildAnalysisOverviewViewModel(input: {
  failureAnalysis: FailureAnalysisViewModel | null;
  tokenAnalysis: TokenAnalysisViewModel | null;
}): AnalysisOverviewViewModel {
  return {
    cards: [
      {
        href: "/analysis/failures",
        title: "Failure analysis",
        description:
          "Review which failure modes and error classes are creating the most operator drag.",
        primaryLabel: "Dominant mode",
        primaryValue:
          input.failureAnalysis?.spotlight.dominantFailureMode ?? "Unavailable",
        primaryDetail:
          input.failureAnalysis?.spotlight.dominantFailureModeDetail ??
          "Failure analysis data is unavailable.",
        secondaryLabel: "Dominant error class",
        secondaryValue:
          input.failureAnalysis?.spotlight.dominantErrorClass ?? "Unavailable",
        secondaryDetail:
          input.failureAnalysis?.spotlight.dominantErrorClassDetail ??
          "No error-class summary is available."
      },
      {
        href: "/analysis/tokens",
        title: "Token analysis",
        description:
          "Review where token load is concentrating across runs, turns, and issues.",
        primaryLabel: "Heaviest run",
        primaryValue: input.tokenAnalysis?.spotlight.heaviestRun ?? "Unavailable",
        primaryDetail:
          input.tokenAnalysis?.spotlight.heaviestRunDetail ??
          "Token analysis data is unavailable.",
        secondaryLabel: "Hottest issue",
        secondaryValue: input.tokenAnalysis?.spotlight.hottestIssue ?? "Unavailable",
        secondaryDetail:
          input.tokenAnalysis?.spotlight.hottestIssueDetail ??
          "No issue token summary is available."
      }
    ]
  };
}
