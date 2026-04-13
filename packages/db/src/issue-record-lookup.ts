import { and, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SymphonyLifecycleBindingScope } from "./lifecycle-binding-scope.js";
import { normalizeLifecycleBindingScope } from "./lifecycle-binding-scope.js";
import { symphonyIssuesTable } from "./schema.js";

type SymphonyDbShape = typeof import("./schema.js").symphonySchema;
export type SymphonyIssueRow = typeof symphonyIssuesTable.$inferSelect;

export function loadIssueRecordByTrackerIssueId(
  db: BetterSQLite3Database<SymphonyDbShape>,
  trackerIssueId: string
): SymphonyIssueRow | null {
  const normalizedTrackerIssueId = sanitizeRequiredText(
    trackerIssueId,
    "trackerIssueId"
  );

  return (
    db
      .select()
      .from(symphonyIssuesTable)
      .where(eq(symphonyIssuesTable.trackerIssueId, normalizedTrackerIssueId))
      .get() ?? null
  );
}

export function loadIssueRecordByIdentifier(
  db: BetterSQLite3Database<SymphonyDbShape>,
  input: {
    issueIdentifier: string;
    bindingScope?: SymphonyLifecycleBindingScope | null;
  }
): SymphonyIssueRow | null {
  const issueIdentifier = sanitizeRequiredText(
    input.issueIdentifier,
    "issueIdentifier"
  );
  const bindingScope = normalizeLifecycleBindingScope(input.bindingScope);

  return (
    db
      .select()
      .from(symphonyIssuesTable)
      .where(
        bindingScope === null
          ? and(
              eq(symphonyIssuesTable.issueIdentifier, issueIdentifier),
              isNull(symphonyIssuesTable.organizationId),
              isNull(symphonyIssuesTable.linearWorkspaceIdentityId)
            )
          : and(
              eq(symphonyIssuesTable.issueIdentifier, issueIdentifier),
              eq(symphonyIssuesTable.organizationId, bindingScope.organizationId),
              eq(
                symphonyIssuesTable.linearWorkspaceIdentityId,
                bindingScope.linearWorkspaceIdentityId
              )
            )
      )
      .get() ?? null
  );
}

export function requireIssueRecordByTrackerIssueIdForRepository(input: {
  db: BetterSQLite3Database<SymphonyDbShape>;
  owner: string;
  repositoryKey: string;
  trackerIssueId: string;
  issueIdentifier?: string | null;
}): SymphonyIssueRow {
  const trackerIssueId = sanitizeRequiredText(input.trackerIssueId, "trackerIssueId");
  const issueIdentifier = sanitizeOptionalText(input.issueIdentifier);
  const issue = loadIssueRecordByTrackerIssueId(input.db, trackerIssueId);

  if (!issue) {
    throw new TypeError(
      `${input.owner} issue not found: ${trackerIssueId}`
    );
  }

  if (issueIdentifier !== null && issue.issueIdentifier !== issueIdentifier) {
    throw new TypeError(
      `${input.owner} issue identifier mismatch for ${issue.trackerIssueId}: ${issue.issueIdentifier} is not ${issueIdentifier}.`
    );
  }

  if (issue.repositoryKey !== sanitizeRequiredText(input.repositoryKey, "repositoryKey")) {
    throw new TypeError(
      `${input.owner} repository mismatch for ${issue.issueIdentifier}: ${issue.repositoryKey} is not ${input.repositoryKey}.`
    );
  }

  return issue;
}

export function requireIssueRecordByIdentifierForRepository(input: {
  db: BetterSQLite3Database<SymphonyDbShape>;
  owner: string;
  repositoryKey: string;
  bindingScope?: SymphonyLifecycleBindingScope | null;
  issueIdentifier: string;
}): SymphonyIssueRow {
  const issueIdentifier = sanitizeRequiredText(
    input.issueIdentifier,
    "issueIdentifier"
  );
  const issue = loadIssueRecordByIdentifier(input.db, {
    issueIdentifier,
    bindingScope: input.bindingScope ?? null
  });

  if (!issue) {
    throw new TypeError(`${input.owner} issue not found: ${issueIdentifier}`);
  }

  if (issue.repositoryKey !== sanitizeRequiredText(input.repositoryKey, "repositoryKey")) {
    throw new TypeError(
      `${input.owner} repository mismatch for ${issue.issueIdentifier}: ${issue.repositoryKey} is not ${input.repositoryKey}.`
    );
  }

  return issue;
}

export function loadIssueRecordMapByTrackerIssueId(
  db: BetterSQLite3Database<SymphonyDbShape>,
  trackerIssueIds: string[]
): Map<string, SymphonyIssueRow> {
  const normalizedTrackerIssueIds = [...new Set(
    trackerIssueIds.flatMap((trackerIssueId) => {
      const normalized = sanitizeOptionalText(trackerIssueId);
      return normalized ? [normalized] : [];
    })
  )];

  if (normalizedTrackerIssueIds.length === 0) {
    return new Map();
  }

  return new Map(
    db
      .select()
      .from(symphonyIssuesTable)
      .where(inArray(symphonyIssuesTable.trackerIssueId, normalizedTrackerIssueIds))
      .all()
      .map((row) => [row.trackerIssueId, row] as const)
  );
}

function sanitizeRequiredText(value: string | null | undefined, field: string): string {
  const normalized = sanitizeOptionalText(value);
  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}

function sanitizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}
