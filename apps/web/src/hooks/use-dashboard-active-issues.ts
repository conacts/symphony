import type { SymphonyRuntimeStateResult } from "@symphony/contracts";

export function collectActiveIssueDescriptors(
  runtimeSummary: SymphonyRuntimeStateResult | null
) {
  if (!runtimeSummary) {
    return [];
  }

  const running = runtimeSummary.running.map((issue) => ({
    issueIdentifier: issue.issueIdentifier,
    fallbackState: issue.state ?? "In Progress"
  }));
  const retrying = runtimeSummary.retrying
    .filter(
      (issue) =>
        !runtimeSummary.running.some(
          (runningIssue) => runningIssue.issueIdentifier === issue.issueIdentifier
        )
    )
    .map((issue) => ({
      issueIdentifier: issue.issueIdentifier,
      fallbackState: "Retrying"
    }));

  return [...running, ...retrying];
}
