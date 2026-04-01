import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { SymphonyDbError } from "./errors.js";
import { applySymphonyDbMigrations, defaultSymphonyDbMigrationsFolder } from "./migration-runner.js";
import { symphonySchema } from "./schema.js";

export type SymphonyDb = {
  client: Database.Database;
  db: BetterSQLite3Database<typeof symphonySchema>;
  dbFile: string;
  migrationsFolder: string;
  close(): void;
};

export function defaultSymphonyDbFile(cwd = process.cwd()): string {
  return path.resolve(cwd, "symphony.db");
}

export function initializeSymphonyDb(input: {
  dbFile: string;
  migrationsFolder?: string;
}): SymphonyDb {
  const dbFile = path.resolve(input.dbFile);
  const migrationsFolder =
    input.migrationsFolder ?? defaultSymphonyDbMigrationsFolder();

  let client: Database.Database;

  try {
    client = new Database(dbFile);
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
  } catch (error) {
    throw new SymphonyDbError(`Failed to open Symphony DB at ${dbFile}.`, {
      cause: error
    });
  }

  try {
    applySymphonyDbMigrations({
      client,
      migrationsFolder
    });
  } catch (error) {
    client.close();
    throw error;
  }

  const db = drizzle({
    client,
    schema: symphonySchema
  });

  return {
    client,
    db,
    dbFile,
    migrationsFolder,
    close() {
      client.close();
    }
  };
}
