import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import {
  symphonyExternalAuthBindingsTable,
  symphonyOrganizationMembershipsTable,
  symphonyOrganizationsTable,
  symphonyUsersTable
} from "./schema.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

async function createHostedIdentityDb() {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-hosted-identity-"));
  tempDirectories.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });

  return {
    database,
    close() {
      database.close();
    }
  };
}

describe("hosted identity schema", () => {
  it("stores canonical tenant identities without fallback values", async () => {
    const { database, close } = await createHostedIdentityDb();
    try {
      const now = "2026-04-12T12:00:00.000Z";

      database.db.insert(symphonyUsersTable).values({
        userId: "user_001",
        handle: "connor",
        displayName: "Connor Sheehan",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyOrganizationsTable).values({
        organizationId: "org_001",
        organizationSlug: "openai",
        displayName: "OpenAI",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyOrganizationMembershipsTable).values({
        organizationId: "org_001",
        userId: "user_001",
        role: "owner",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyExternalAuthBindingsTable).values({
        bindingId: "binding_001",
        userId: "user_001",
        provider: "github",
        providerAccountId: "github_001",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(
        database.db.select().from(symphonyUsersTable).all()
      ).toHaveLength(1);
      expect(
        database.db.select().from(symphonyOrganizationsTable).all()
      ).toHaveLength(1);
      expect(
        database.db.select().from(symphonyOrganizationMembershipsTable).all()
      ).toHaveLength(1);
      expect(
        database.db.select().from(symphonyExternalAuthBindingsTable).all()
      ).toHaveLength(1);
    } finally {
      close();
    }
  });

  it("rejects blank hosted identity fields and unsupported enum values", async () => {
    const { database, close } = await createHostedIdentityDb();
    try {
      const now = "2026-04-12T12:00:00.000Z";

      expect(() =>
        database.client.prepare(`
          insert into symphony_users (
            user_id,
            handle,
            display_name,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?)
        `).run("", "connor", "Connor Sheehan", now, now)
      ).toThrow(/CHECK constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_organizations (
            organization_id,
            organization_slug,
            display_name,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?)
        `).run("org_002", "", "OpenAI", now, now)
      ).toThrow(/CHECK constraint failed/);

      database.db.insert(symphonyUsersTable).values({
        userId: "user_002",
        handle: "connor-2",
        displayName: "Connor Two",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.client.prepare(`
          insert into symphony_external_auth_bindings (
            binding_id,
            user_id,
            provider,
            provider_account_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?)
        `).run("binding_002", "user_002", "slack", "slack_002", now, now)
      ).toThrow(/CHECK constraint failed/);

      database.db.insert(symphonyOrganizationsTable).values({
        organizationId: "org_002",
        organizationSlug: "openai-2",
        displayName: "OpenAI 2",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.client.prepare(`
          insert into symphony_organization_memberships (
            organization_id,
            user_id,
            role,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?)
        `).run("org_002", "user_002", "ownerless", now, now)
      ).toThrow(/CHECK constraint failed/);
    } finally {
      close();
    }
  });

  it("rejects orphaned or duplicate hosted bindings", async () => {
    const { database, close } = await createHostedIdentityDb();
    try {
      const now = "2026-04-12T12:00:00.000Z";

      expect(() =>
        database.client.prepare(`
          insert into symphony_organization_memberships (
            organization_id,
            user_id,
            role,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?)
        `).run("org_missing", "user_missing", "member", now, now)
      ).toThrow(/FOREIGN KEY constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_external_auth_bindings (
            binding_id,
            user_id,
            provider,
            provider_account_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?)
        `).run("binding_missing", "user_missing", "github", "github_missing", now, now)
      ).toThrow(/FOREIGN KEY constraint failed/);

      database.db.insert(symphonyUsersTable).values({
        userId: "user_003",
        handle: "connor-3",
        displayName: "Connor Three",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyOrganizationsTable).values({
        organizationId: "org_003",
        organizationSlug: "openai-3",
        displayName: "OpenAI 3",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyOrganizationMembershipsTable).values({
        organizationId: "org_003",
        userId: "user_003",
        role: "member",
        insertedAt: now,
        updatedAt: now
      }).run();

      database.db.insert(symphonyExternalAuthBindingsTable).values({
        bindingId: "binding_003",
        userId: "user_003",
        provider: "github",
        providerAccountId: "github_003",
        insertedAt: now,
        updatedAt: now
      }).run();

      expect(() =>
        database.client.prepare(`
          insert into symphony_organization_memberships (
            organization_id,
            user_id,
            role,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?)
        `).run("org_003", "user_003", "admin", now, now)
      ).toThrow(/UNIQUE constraint failed/);

      expect(() =>
        database.client.prepare(`
          insert into symphony_external_auth_bindings (
            binding_id,
            user_id,
            provider,
            provider_account_id,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?)
        `).run("binding_004", "user_003", "github", "github_004", now, now)
      ).toThrow(/UNIQUE constraint failed/);
    } finally {
      close();
    }
  });
});
