import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  assertMatchingLifecycleBindingScope,
  mapLifecycleBindingScope,
  normalizeLifecycleBindingScope,
  type SymphonyLifecycleBindingScope
} from "./lifecycle-binding-scope.js";
import { symphonyIssuesTable } from "./schema.js";

export type SymphonyIssueRecord = {
  issueIdentifier: string;
  trackerIssueId: string;
  repositoryKey: string;
  bindingScope: SymphonyLifecycleBindingScope | null;
  latestRunStartedAt: string | null;
  insertedAt: string;
  updatedAt: string;
};

export interface SymphonyIssueStore {
  fetchByIdentifier(issueIdentifier: string): Promise<SymphonyIssueRecord | null>;
  fetchByScopedIdentifier(input: {
    issueIdentifier: string;
    bindingScope: SymphonyLifecycleBindingScope;
  }): Promise<SymphonyIssueRecord | null>;
  upsert(input: {
    issueIdentifier: string;
    trackerIssueId: string;
    repositoryKey: string;
    bindingScope?: SymphonyLifecycleBindingScope | null;
    latestRunStartedAt: string | null;
    recordedAt: string;
  }): Promise<void>;
}

export function createSymphonyIssueStore(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>
): SymphonyIssueStore {
  return {
    async fetchByIdentifier(issueIdentifier) {
      const normalizedIssueIdentifier = sanitizeRequiredText(
        issueIdentifier,
        "issueIdentifier"
      );
      const row = db
        .select()
        .from(symphonyIssuesTable)
        .where(eq(symphonyIssuesTable.issueIdentifier, normalizedIssueIdentifier))
        .get();

      if (!row) {
        return null;
      }

      const record = mapIssueRow(row);
      assertMatchingLifecycleBindingScope({
        owner: `Issue ${record.issueIdentifier}`,
        actual: record.bindingScope,
        expected: null
      });
      return record;
    },

    async fetchByScopedIdentifier(input) {
      const normalizedIssueIdentifier = sanitizeRequiredText(
        input.issueIdentifier,
        "issueIdentifier"
      );
      const bindingScope = normalizeLifecycleBindingScope(input.bindingScope);
      const row = db
        .select()
        .from(symphonyIssuesTable)
        .where(eq(symphonyIssuesTable.issueIdentifier, normalizedIssueIdentifier))
        .get();

      if (!row) {
        return null;
      }

      const record = mapIssueRow(row);
      assertMatchingLifecycleBindingScope({
        owner: `Issue ${record.issueIdentifier}`,
        actual: record.bindingScope,
        expected: bindingScope
      });
      return record;
    },

    async upsert(input) {
      const issueIdentifier = sanitizeRequiredText(
        input.issueIdentifier,
        "issueIdentifier"
      );
      const trackerIssueId = sanitizeRequiredText(
        input.trackerIssueId,
        "trackerIssueId"
      );
      const repositoryKey = sanitizeRequiredText(
        input.repositoryKey,
        "repositoryKey"
      );
      const bindingScope = normalizeLifecycleBindingScope(input.bindingScope);
      const latestRunStartedAt = normalizeOptionalIsoTimestamp(
        input.latestRunStartedAt,
        "latestRunStartedAt"
      );
      const recordedAt = requireIsoTimestamp(input.recordedAt, "recordedAt");
      const existing = db
        .select()
        .from(symphonyIssuesTable)
        .where(eq(symphonyIssuesTable.issueIdentifier, issueIdentifier))
        .get();

      if (!existing) {
        db.insert(symphonyIssuesTable)
          .values({
            issueIdentifier,
            trackerIssueId,
            repositoryKey,
            organizationId: bindingScope?.organizationId ?? null,
            linearWorkspaceIdentityId:
              bindingScope?.linearWorkspaceIdentityId ?? null,
            latestRunStartedAt,
            insertedAt: recordedAt,
            updatedAt: recordedAt
          })
          .run();
        return;
      }

      const existingBindingScope = mapLifecycleBindingScope({
        organizationId: existing.organizationId,
        linearWorkspaceIdentityId: existing.linearWorkspaceIdentityId,
        owner: `Issue ${issueIdentifier}`
      });
      assertMatchingLifecycleBindingScope({
        owner: `Issue ${issueIdentifier}`,
        actual: existingBindingScope,
        expected: bindingScope
      });

      if (existing.repositoryKey !== repositoryKey) {
        throw new TypeError(
          `Issue ${issueIdentifier} is already bound to repository ${existing.repositoryKey}, not ${repositoryKey}.`
        );
      }

      if (existing.trackerIssueId !== trackerIssueId) {
        throw new TypeError(
          `Issue ${issueIdentifier} is already bound to tracker issue ${existing.trackerIssueId}, not ${trackerIssueId}.`
        );
      }

      db.update(symphonyIssuesTable)
        .set({
          latestRunStartedAt:
            latestRunStartedAt && isLaterTimestamp(latestRunStartedAt, existing.latestRunStartedAt)
              ? latestRunStartedAt
              : existing.latestRunStartedAt,
          updatedAt: recordedAt
        })
        .where(eq(symphonyIssuesTable.issueIdentifier, issueIdentifier))
        .run();
    }
  };
}

function sanitizeRequiredText(value: string | null | undefined, field: string): string {
  const normalized = sanitizeText(value);
  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isLaterTimestamp(
  candidate: string,
  current: string | null
): boolean {
  if (!current) {
    return true;
  }

  return candidate.localeCompare(current) > 0;
}

function normalizeOptionalIsoTimestamp(
  value: string | null,
  field: string
): string | null {
  if (value === null) {
    return null;
  }

  return requireIsoTimestamp(value, field);
}

function requireIsoTimestamp(value: string, field: string): string {
  const normalized = sanitizeRequiredText(value, field);
  const parsed = Date.parse(normalized);

  if (Number.isNaN(parsed)) {
    throw new TypeError(`${field} must be a valid ISO timestamp.`);
  }

  return new Date(parsed).toISOString();
}

function mapIssueRow(
  row: typeof symphonyIssuesTable.$inferSelect
): SymphonyIssueRecord {
  return {
    issueIdentifier: row.issueIdentifier,
    trackerIssueId: row.trackerIssueId,
    repositoryKey: row.repositoryKey,
    bindingScope: mapLifecycleBindingScope({
      organizationId: row.organizationId,
      linearWorkspaceIdentityId: row.linearWorkspaceIdentityId,
      owner: `Issue ${row.issueIdentifier}`
    }),
    latestRunStartedAt: row.latestRunStartedAt ?? null,
    insertedAt: row.insertedAt,
    updatedAt: row.updatedAt
  };
}
