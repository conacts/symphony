import { issueBranchName, type SymphonyTrackerIssue } from "../tracker/symphony-tracker.js";

export function buildSymphonyTrackerIssue(
  overrides: Partial<SymphonyTrackerIssue> = {}
): SymphonyTrackerIssue {
  const identifier = overrides.identifier ?? "COL-123";

  return {
    id: overrides.id ?? "issue-123",
    identifier,
    title: overrides.title ?? "Test issue",
    description: overrides.description ?? "Test description",
    priority: overrides.priority ?? 2,
    state: overrides.state ?? "Todo",
    branchName: overrides.branchName ?? issueBranchName(identifier),
    url: overrides.url ?? `https://linear.app/coldets/issue/${identifier.toLowerCase()}`,
    projectId: overrides.projectId ?? "project-1",
    projectName:
      overrides.projectName ?? "Symphony Developer Control Plane Foundation",
    projectSlug:
      overrides.projectSlug ?? "symphony-developer-control-plane-foundation",
    teamKey: overrides.teamKey ?? "COL",
    assigneeId: overrides.assigneeId ?? "worker-1",
    blockedBy: overrides.blockedBy ?? [],
    labels: overrides.labels ?? [],
    assignedToWorker: overrides.assignedToWorker ?? true,
    createdAt: overrides.createdAt ?? "2026-03-31T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-31T00:00:00.000Z"
  };
}
