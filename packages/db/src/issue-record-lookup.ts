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

export function loadIssueRecordByTrackerIssueKey(
  db: BetterSQLite3Database<SymphonyDbShape>,
  input: {
    trackerIssueKey: string;
    bindingScope?: SymphonyLifecycleBindingScope | null;
  }
): SymphonyIssueRow | null {
  const trackerIssueKey = sanitizeRequiredText(
    input.trackerIssueKey,
    "trackerIssueKey"
  );
  const bindingScope = normalizeLifecycleBindingScope(input.bindingScope);

  return (
    db
      .select()
      .from(symphonyIssuesTable)
      .where(
        bindingScope === null
          ? and(
              eq(symphonyIssuesTable.issueIdentifier, trackerIssueKey),
              isNull(symphonyIssuesTable.organizationId),
              isNull(symphonyIssuesTable.linearWorkspaceIdentityId)
            )
          : and(
              eq(symphonyIssuesTable.issueIdentifier, trackerIssueKey),
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
  trackerIssueKey?: string | null;
}): SymphonyIssueRow {
  const trackerIssueId = sanitizeRequiredText(input.trackerIssueId, "trackerIssueId");
  const trackerIssueKey = sanitizeOptionalText(input.trackerIssueKey);
  const issue = loadIssueRecordByTrackerIssueId(input.db, trackerIssueId);

  if (!issue) {
    throw new TypeError(
      `${input.owner} issue not found: ${trackerIssueId}`
    );
  }

  if (trackerIssueKey !== null && issue.issueIdentifier !== trackerIssueKey) {
    throw new TypeError(
      `${input.owner} tracker issue key mismatch for ${issue.trackerIssueId}: ${issue.issueIdentifier} is not ${trackerIssueKey}.`
    );
  }

  if (issue.repositoryKey !== sanitizeRequiredText(input.repositoryKey, "repositoryKey")) {
    throw new TypeError(
      `${input.owner} repository mismatch for ${issue.issueIdentifier}: ${issue.repositoryKey} is not ${input.repositoryKey}.`
    );
  }

  return issue;
}

export function requireIssueRecordByTrackerIssueKeyForRepository(input: {
  db: BetterSQLite3Database<SymphonyDbShape>;
  owner: string;
  repositoryKey: string;
  bindingScope?: SymphonyLifecycleBindingScope | null;
  trackerIssueKey: string;
}): SymphonyIssueRow {
  const trackerIssueKey = sanitizeRequiredText(
    input.trackerIssueKey,
    "trackerIssueKey"
  );
  const issue = loadIssueRecordByTrackerIssueKey(input.db, {
    trackerIssueKey,
    bindingScope: input.bindingScope ?? null
  });

  if (!issue) {
    throw new TypeError(`${input.owner} issue not found: ${trackerIssueKey}`);
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
