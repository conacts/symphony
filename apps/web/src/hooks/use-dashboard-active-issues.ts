import type { SymphonyRuntimeStateResult } from "@symphony/contracts";

export function collectActiveIssueDescriptors(
  runtimeSummary: SymphonyRuntimeStateResult | null
) {
  if (!runtimeSummary) {
    return [];
  }

  const running = runtimeSummary.running.map((issue) => ({
    trackerIssueKey: issue.trackerIssueKey,
    fallbackState: issue.state ?? "In Progress"
  }));
  const retrying = runtimeSummary.retrying
    .filter(
      (issue) =>
        !runtimeSummary.running.some(
          (runningIssue) => runningIssue.trackerIssueKey === issue.trackerIssueKey
        )
    )
    .map((issue) => ({
      trackerIssueKey: issue.trackerIssueKey,
      fallbackState: "Retrying"
    }));

  return [...running, ...retrying];
}
