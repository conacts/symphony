export type ControlPlaneBreadcrumbRoute = {
  label: string;
  href?: string;
};

export function buildIssuesHref(): string {
  return "/issues";
}

export function buildIssueHref(issueIdentifier: string): string {
  return `${buildIssuesHref()}/${encodeURIComponent(issueIdentifier)}`;
}

export function buildIssueTimelineHref(issueIdentifier: string): string {
  return `${buildIssueHref(issueIdentifier)}/timeline`;
}

export function buildIssueRunHref(
  issueIdentifier: string,
  runId: string
): string {
  return `${buildIssueHref(issueIdentifier)}/runs/${encodeURIComponent(runId)}`;
}

export function buildIssueRunTurnsHref(
  issueIdentifier: string,
  runId: string
): string {
  return `${buildIssueRunHref(issueIdentifier, runId)}/turns`;
}

export function buildIssueRunTurnHref(
  issueIdentifier: string,
  runId: string,
  turnId: string
): string {
  return `${buildIssueRunTurnsHref(issueIdentifier, runId)}/${encodeURIComponent(turnId)}`;
}

export function buildLegacyRunHref(runId: string): string {
  return `/runs/${encodeURIComponent(runId)}`;
}

export function buildIssueBreadcrumbRoutes(
  issueIdentifier: string
): ControlPlaneBreadcrumbRoute[] {
  return [
    { label: "Issues", href: buildIssuesHref() },
    { label: issueIdentifier, href: buildIssueHref(issueIdentifier) }
  ];
}

export function buildIssueTimelineBreadcrumbRoutes(
  issueIdentifier: string
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueBreadcrumbRoutes(issueIdentifier),
    { label: "Timeline", href: buildIssueTimelineHref(issueIdentifier) }
  ];
}

export function buildIssueRunBreadcrumbRoutes(
  issueIdentifier: string,
  runId: string
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueBreadcrumbRoutes(issueIdentifier),
    { label: runId, href: buildIssueRunHref(issueIdentifier, runId) }
  ];
}

export function buildIssueRunTurnsBreadcrumbRoutes(
  issueIdentifier: string,
  runId: string
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueRunBreadcrumbRoutes(issueIdentifier, runId),
    { label: "Turns", href: buildIssueRunTurnsHref(issueIdentifier, runId) }
  ];
}

export function buildIssueRunTurnBreadcrumbRoutes(
  issueIdentifier: string,
  runId: string,
  turnId: string
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueRunTurnsBreadcrumbRoutes(issueIdentifier, runId),
    { label: turnId, href: buildIssueRunTurnHref(issueIdentifier, runId, turnId) }
  ];
}
