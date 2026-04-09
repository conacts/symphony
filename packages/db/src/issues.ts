import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { symphonyIssuesTable } from "./schema.js";

export interface SymphonyIssueStore {
  upsert(input: {
    issueIdentifier: string;
    trackerIssueId: string;
    repositoryKey: string;
    latestRunStartedAt?: string | null;
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
      const latestRunStartedAt = sanitizeText(input.latestRunStartedAt);
      const now = new Date().toISOString();
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
            insertedAt: now,
            updatedAt: now
          })
          .run();
        return;
      }

      db.update(symphonyIssuesTable)
        .set({
          trackerIssueId,
          repositoryKey,
          latestRunStartedAt:
            latestRunStartedAt && isLaterTimestamp(latestRunStartedAt, existing.latestRunStartedAt)
              ? latestRunStartedAt
              : existing.latestRunStartedAt,
          updatedAt: now
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
