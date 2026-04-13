type ControlPlaneBreadcrumbRoute = {
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
  trackerIssueKey: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(`/issues/${encodeURIComponent(trackerIssueKey)}`, scope);
}

export function buildIssueTimelineHref(
  trackerIssueKey: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(
    `/issues/${encodeURIComponent(trackerIssueKey)}/timeline`,
    scope
  );
}

export function buildIssueRunHref(
  trackerIssueKey: string,
  runId: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(
    `/issues/${encodeURIComponent(trackerIssueKey)}/runs/${encodeURIComponent(runId)}`,
    scope
  );
}

export function buildIssueRunTurnsHref(
  trackerIssueKey: string,
  runId: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(
    `/issues/${encodeURIComponent(trackerIssueKey)}/runs/${encodeURIComponent(runId)}/turns`,
    scope
  );
}

export function buildIssueRunTurnHref(
  trackerIssueKey: string,
  runId: string,
  turnId: string,
  scope?: ControlPlaneRepoScope
): string {
  return buildRepoScopedHref(
    `/issues/${encodeURIComponent(trackerIssueKey)}/runs/${encodeURIComponent(runId)}/turns/${encodeURIComponent(turnId)}`,
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
  trackerIssueKey: string,
  scope?: ControlPlaneRepoScope
): ControlPlaneBreadcrumbRoute[] {
  return [
    { label: "Issues", href: buildIssuesHref(scope) },
    { label: trackerIssueKey, href: buildIssueHref(trackerIssueKey, scope) }
  ];
}

export function buildIssueTimelineBreadcrumbRoutes(
  trackerIssueKey: string,
  scope?: ControlPlaneRepoScope
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueBreadcrumbRoutes(trackerIssueKey, scope),
    { label: "Timeline", href: buildIssueTimelineHref(trackerIssueKey, scope) }
  ];
}

export function buildIssueRunBreadcrumbRoutes(
  trackerIssueKey: string,
  runId: string,
  scope?: ControlPlaneRepoScope
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueBreadcrumbRoutes(trackerIssueKey, scope),
    { label: runId, href: buildIssueRunHref(trackerIssueKey, runId, scope) }
  ];
}

export function buildIssueRunTurnsBreadcrumbRoutes(
  trackerIssueKey: string,
  runId: string,
  scope?: ControlPlaneRepoScope
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueRunBreadcrumbRoutes(trackerIssueKey, runId, scope),
    { label: "Turns", href: buildIssueRunTurnsHref(trackerIssueKey, runId, scope) }
  ];
}

export function buildIssueRunTurnBreadcrumbRoutes(
  trackerIssueKey: string,
  runId: string,
  turnId: string,
  scope?: ControlPlaneRepoScope
): ControlPlaneBreadcrumbRoute[] {
  return [
    ...buildIssueRunTurnsBreadcrumbRoutes(trackerIssueKey, runId, scope),
    { label: turnId, href: buildIssueRunTurnHref(trackerIssueKey, runId, turnId, scope) }
  ];
}
