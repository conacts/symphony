import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { SymphonyDbMigrationError } from "./errors.js";

export function defaultSymphonyDbMigrationsFolder(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "migrations"
  );
}

export function applySymphonyDbMigrations(input: {
  client: Database.Database;
  migrationsFolder?: string;
}): void {
  const migrationsFolder =
    input.migrationsFolder ?? defaultSymphonyDbMigrationsFolder();

  let migrationFiles: string[];

  try {
    migrationFiles = readdirSync(migrationsFolder)
      .filter((entry) => entry.endsWith(".sql"))
      .sort();
  } catch (error) {
    throw new SymphonyDbMigrationError(
      `Failed to read Symphony DB migrations from ${migrationsFolder}.`,
      {
        cause: error
      }
    );
  }

  try {
    input.client.exec(`
      CREATE TABLE IF NOT EXISTS symphony_migrations (
        name TEXT PRIMARY KEY NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
  } catch (error) {
    throw new SymphonyDbMigrationError(
      "Failed to initialize Symphony DB migration state.",
      {
        cause: error
      }
    );
  }

  const appliedRows = input.client
    .prepare("SELECT name FROM symphony_migrations;")
    .all() as Array<{ name: string }>;
  const appliedNames = new Set(appliedRows.map((row) => row.name));

  for (const fileName of migrationFiles) {
    if (appliedNames.has(fileName)) {
      continue;
    }

    const migrationPath = path.join(migrationsFolder, fileName);
    const sqlText = readFileSync(migrationPath, "utf8");
    const checksum = createHash("sha256").update(sqlText).digest("hex");
    const appliedAt = new Date().toISOString();

    try {
      const transaction = input.client.transaction(() => {
        input.client.exec(sqlText);
        input.client
          .prepare(
            `
              INSERT INTO symphony_migrations (name, checksum, applied_at)
              VALUES (?, ?, ?);
            `
          )
          .run(fileName, checksum, appliedAt);
      });

      transaction();
    } catch (error) {
      throw new SymphonyDbMigrationError(
        `Failed to apply Symphony DB migration ${fileName}.`,
        {
          cause: error
        }
      );
    }
  }
}
