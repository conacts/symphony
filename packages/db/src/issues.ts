import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { symphonyIssuesTable } from "./schema.js";

export interface SymphonyIssueStore {
  upsert(input: {
    issueIdentifier: string;
    trackerIssueId: string;
    repositoryKey: string;
    latestRunStartedAt: string | null;
    recordedAt: string;
  }): Promise<void>;
}

export function createSymphonyIssueStore(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>
): SymphonyIssueStore {
  return {
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
            latestRunStartedAt,
            insertedAt: recordedAt,
            updatedAt: recordedAt
          })
          .run();
        return;
      }

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
