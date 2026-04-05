export function buildIssueHref(issueIdentifier: string): string {
  return `/issues/${encodeURIComponent(issueIdentifier)}`;
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
