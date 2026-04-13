import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  assertMatchingLifecycleBindingScope,
  mapLifecycleBindingScope,
  normalizeLifecycleBindingScope,
  type SymphonyLifecycleBindingScope
} from "./lifecycle-binding-scope.js";
import {
  symphonyIssuesTable
} from "./schema.js";

export type SymphonyIssueRecord = {
  trackerIssueId: string;
  trackerIssueKey: string;
  repositoryKey: string;
  bindingScope: SymphonyLifecycleBindingScope | null;
  repositoryWorkspaceBindingId: string | null;
  latestRunStartedAt: string | null;
  insertedAt: string;
  updatedAt: string;
};

export type SymphonyIssueUpsertInput =
  | {
      trackerIssueKey: string;
      trackerIssueId: string;
      repositoryKey: string;
      bindingScope?: null | undefined;
      repositoryWorkspaceBindingId?: null | undefined;
      latestRunStartedAt: string | null;
      recordedAt: string;
    }
  | {
      trackerIssueKey: string;
      trackerIssueId: string;
      repositoryKey: string;
      bindingScope: SymphonyLifecycleBindingScope;
      repositoryWorkspaceBindingId: string;
      latestRunStartedAt: string | null;
      recordedAt: string;
    };

export interface SymphonyIssueStore {
  fetchByTrackerIssueKey(
    trackerIssueKey: string
  ): Promise<SymphonyIssueRecord | null>;
  fetchByTrackerIssueId(trackerIssueId: string): Promise<SymphonyIssueRecord | null>;
  fetchByScopedTrackerIssueKey(input: {
    trackerIssueKey: string;
    bindingScope: SymphonyLifecycleBindingScope;
  }): Promise<SymphonyIssueRecord | null>;
  upsert(input: SymphonyIssueUpsertInput): Promise<void>;
}

export function createSymphonyIssueStore(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>
): SymphonyIssueStore {
  return {
    async fetchByTrackerIssueKey(trackerIssueKey) {
      return loadIssueByTrackerIssueKey(db, trackerIssueKey, null);
    },

    async fetchByTrackerIssueId(trackerIssueId) {
      return loadIssueByTrackerIssueId(db, trackerIssueId);
    },

    async fetchByScopedTrackerIssueKey(input) {
      const bindingScope = normalizeLifecycleBindingScope(input.bindingScope);
      return loadIssueByTrackerIssueKey(
        db,
        input.trackerIssueKey,
        bindingScope
      );
    },

    async upsert(input: SymphonyIssueUpsertInput) {
      const trackerIssueKey = sanitizeRequiredText(
        input.trackerIssueKey,
        "trackerIssueKey"
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
      const repositoryWorkspaceBindingId = sanitizeText(
        input.repositoryWorkspaceBindingId
      );
      const latestRunStartedAt = normalizeOptionalIsoTimestamp(
        input.latestRunStartedAt,
        "latestRunStartedAt"
      );
      const recordedAt = requireIsoTimestamp(input.recordedAt, "recordedAt");

      if (bindingScope === null && repositoryWorkspaceBindingId !== null) {
        throw new TypeError(
          `Issue ${trackerIssueKey} cannot bind hosted repository workspace ${repositoryWorkspaceBindingId} without a hosted workspace scope.`
        );
      }
      if (bindingScope !== null && repositoryWorkspaceBindingId === null) {
        throw new TypeError(
          `Issue ${trackerIssueKey} requires repositoryWorkspaceBindingId for hosted workspace ${bindingScope.organizationId}/${bindingScope.linearWorkspaceIdentityId}.`
        );
      }

      const existing = db
        .select()
        .from(symphonyIssuesTable)
        .where(eq(symphonyIssuesTable.trackerIssueId, trackerIssueId))
        .get();

      if (!existing) {
        const conflictingIssueRecord = loadIssueByTrackerIssueKey(
          db,
          trackerIssueKey,
          bindingScope
        );
        if (conflictingIssueRecord) {
          throw new TypeError(
            `Issue ${trackerIssueKey} is already bound to tracker issue ${conflictingIssueRecord.trackerIssueId}, not ${trackerIssueId}.`
          );
        }

        db.insert(symphonyIssuesTable)
          .values({
            trackerIssueId,
            issueIdentifier: trackerIssueKey,
            repositoryKey,
            organizationId: bindingScope?.organizationId ?? null,
            linearWorkspaceIdentityId:
              bindingScope?.linearWorkspaceIdentityId ?? null,
            repositoryWorkspaceBindingId,
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
        owner: `Issue ${trackerIssueKey}`
      });
      assertMatchingLifecycleBindingScope({
        owner: `Issue ${trackerIssueKey}`,
        actual: existingBindingScope,
        expected: bindingScope
      });

      if (existing.repositoryKey !== repositoryKey) {
        throw new TypeError(
          `Issue ${existing.issueIdentifier} is already bound to repository ${existing.repositoryKey}, not ${repositoryKey}.`
        );
      }

      if (
        existing.repositoryWorkspaceBindingId !== null &&
        existing.repositoryWorkspaceBindingId !== repositoryWorkspaceBindingId
      ) {
        throw new TypeError(
          `Issue ${existing.issueIdentifier} is already bound to hosted repository workspace ${existing.repositoryWorkspaceBindingId}, not ${repositoryWorkspaceBindingId ?? "null"}.`
        );
      }

      if (existing.issueIdentifier !== trackerIssueKey) {
        const conflictingIssueRecord = loadIssueByTrackerIssueKey(
          db,
          trackerIssueKey,
          bindingScope
        );
        if (conflictingIssueRecord) {
          throw new TypeError(
            `Issue ${trackerIssueKey} is already bound to tracker issue ${conflictingIssueRecord.trackerIssueId}, not ${trackerIssueId}.`
          );
        }
      }

      db.update(symphonyIssuesTable)
        .set({
          issueIdentifier: trackerIssueKey,
          repositoryWorkspaceBindingId:
            existing.repositoryWorkspaceBindingId ?? repositoryWorkspaceBindingId,
          latestRunStartedAt:
            latestRunStartedAt && isLaterTimestamp(latestRunStartedAt, existing.latestRunStartedAt)
              ? latestRunStartedAt
              : existing.latestRunStartedAt,
          updatedAt: recordedAt
        })
        .where(eq(symphonyIssuesTable.trackerIssueId, trackerIssueId))
        .run();

    }
  };
}

function loadIssueByTrackerIssueKey(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
  trackerIssueKey: string,
  bindingScope: SymphonyLifecycleBindingScope | null
): SymphonyIssueRecord | null {
  const normalizedTrackerIssueKey = sanitizeRequiredText(
    trackerIssueKey,
    "trackerIssueKey"
  );
  const row = db
    .select()
    .from(symphonyIssuesTable)
    .where(
      bindingScope === null
        ? and(
            eq(symphonyIssuesTable.issueIdentifier, normalizedTrackerIssueKey),
            isNull(symphonyIssuesTable.organizationId),
            isNull(symphonyIssuesTable.linearWorkspaceIdentityId)
          )
        : and(
            eq(symphonyIssuesTable.issueIdentifier, normalizedTrackerIssueKey),
            eq(symphonyIssuesTable.organizationId, bindingScope.organizationId),
            eq(
              symphonyIssuesTable.linearWorkspaceIdentityId,
              bindingScope.linearWorkspaceIdentityId
            )
          )
    )
    .get();

  return row ? mapIssueRow(row) : null;
}

function loadIssueByTrackerIssueId(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
  trackerIssueId: string
): SymphonyIssueRecord | null {
  const normalizedTrackerIssueId = sanitizeRequiredText(
    trackerIssueId,
    "trackerIssueId"
  );
  const row = db
    .select()
    .from(symphonyIssuesTable)
    .where(eq(symphonyIssuesTable.trackerIssueId, normalizedTrackerIssueId))
    .get();

  return row ? mapIssueRow(row) : null;
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
    trackerIssueId: row.trackerIssueId,
    trackerIssueKey: row.issueIdentifier,
    repositoryKey: row.repositoryKey,
    bindingScope: mapLifecycleBindingScope({
      organizationId: row.organizationId,
      linearWorkspaceIdentityId: row.linearWorkspaceIdentityId,
      owner: `Issue ${row.issueIdentifier}`
    }),
    repositoryWorkspaceBindingId: row.repositoryWorkspaceBindingId ?? null,
    latestRunStartedAt: row.latestRunStartedAt ?? null,
    insertedAt: row.insertedAt,
    updatedAt: row.updatedAt
  };
}
