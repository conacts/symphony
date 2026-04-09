export type ControlPlaneBreadcrumbRoute = {
  label: string;
  href?: string;
};

import {
  buildRepoScopedHref,
  type ControlPlaneRepoScope
} from "@/core/control-plane-repo-scope";

export function buildIssuesHref(scope?: ControlPlaneRepoScope): string {
  return buildRepoScopedHref("/issues", scope);
}

export function buildIssueHref(
  issueIdentifier: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(`/issues/${encodeURIComponent(issueIdentifier)}`, scope);
}

export function buildIssueTimelineHref(
  issueIdentifier: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(
    `/issues/${encodeURIComponent(issueIdentifier)}/timeline`,
    scope
  );
}

export function buildIssueRunHref(
  issueIdentifier: string,
  runId: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(
    `/issues/${encodeURIComponent(issueIdentifier)}/runs/${encodeURIComponent(runId)}`,
    scope
  );
}

export function buildIssueRunTurnsHref(
  issueIdentifier: string,
  runId: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(
    `/issues/${encodeURIComponent(issueIdentifier)}/runs/${encodeURIComponent(runId)}/turns`,
    scope
  );
}

export function buildIssueRunTurnHref(
  issueIdentifier: string,
  runId: string,
  turnId: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(
    `/issues/${encodeURIComponent(issueIdentifier)}/runs/${encodeURIComponent(runId)}/turns/${encodeURIComponent(turnId)}`,
    scope
  );
}

export function buildRunTranscriptHref(
  runId: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(`/runs/${encodeURIComponent(runId)}`, scope);
}

export function buildIssueBreadcrumbRoutes(
  issueIdentifier: string,
  scope?: ControlPlaneRepoScope
): ControlPlaneBreadcrumbRoute[] {
  return [
    { label: "Issues", href: buildIssuesHref(scope) },
    { label: issueIdentifier, href: buildIssueHref(issueIdentifier, scope) }
  ];
}

export function buildIssueTimelineBreadcrumbRoutes(
  issueIdentifier: string,
  scope?: ControlPlaneRepoScope
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueBreadcrumbRoutes(issueIdentifier, scope),
    { label: "Timeline", href: buildIssueTimelineHref(issueIdentifier, scope) }
  ];
}

export function buildIssueRunBreadcrumbRoutes(
  issueIdentifier: string,
  runId: string,
  scope?: ControlPlaneRepoScope
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueBreadcrumbRoutes(issueIdentifier, scope),
    { label: runId, href: buildIssueRunHref(issueIdentifier, runId, scope) }
  ];
}

export function buildIssueRunTurnsBreadcrumbRoutes(
  issueIdentifier: string,
  runId: string,
  scope?: ControlPlaneRepoScope
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueRunBreadcrumbRoutes(issueIdentifier, runId, scope),
    { label: "Turns", href: buildIssueRunTurnsHref(issueIdentifier, runId, scope) }
  ];
}

export function buildIssueRunTurnBreadcrumbRoutes(
  issueIdentifier: string,
  runId: string,
  turnId: string,
  scope?: ControlPlaneRepoScope
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueRunTurnsBreadcrumbRoutes(issueIdentifier, runId, scope),
    { label: turnId, href: buildIssueRunTurnHref(issueIdentifier, runId, turnId, scope) }
  ];
}
