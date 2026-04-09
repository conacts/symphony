import { chmod, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { SymphonyDbError } from "./errors.js";

export const defaultRuntimeDbSnapshotName = "runtime-snapshot.db";

/**
 * Creates a read-only snapshot copy of the Symphony runtime database.
 *
 * The snapshot uses SQLite's backup API so it stays consistent even when the
 * source database is live and writing in WAL mode. The file is made read-only
 * to prevent accidental modifications.
 *
 * @param input.sourceDbFile - Path to the source runtime database file
 * @param input.targetDirectory - Directory where the snapshot should be created
 * @param input.snapshotName - Optional name for the snapshot file (defaults to "runtime-snapshot.db")
 * @returns Path to the created snapshot file
 */
export async function copySymphonyDbSnapshot(input: {
  sourceDbFile: string;
  targetDirectory: string;
  snapshotName?: string;
}): Promise<string> {
  const sourcePath = path.resolve(input.sourceDbFile);
  const targetDirectory = path.resolve(input.targetDirectory);
  const snapshotName = input.snapshotName ?? defaultRuntimeDbSnapshotName;
  const targetPath = path.join(targetDirectory, snapshotName);

  // Ensure target directory exists
  await mkdir(targetDirectory, { recursive: true });

  // Verify source file exists
  let sourceStat;
  try {
    sourceStat = await stat(sourcePath);
  } catch (error) {
    throw new SymphonyDbError(
      `Source database file not found: ${sourcePath}`,
      { cause: error }
    );
  }

  if (!sourceStat.isFile()) {
    throw new SymphonyDbError(
      `Source database path is not a file: ${sourcePath}`
    );
  }

  await removeExistingSnapshotFile(targetPath);

  let sourceDb: Database.Database | null = null;
  try {
    sourceDb = new Database(sourcePath, {
      readonly: true,
      fileMustExist: true
    });
    await sourceDb.backup(targetPath);
  } catch (error) {
    await rm(targetPath, { force: true }).catch(() => {});
    throw new SymphonyDbError(
      `Failed to create database snapshot from ${sourcePath} to ${targetPath}`,
      { cause: error }
    );
  } finally {
    sourceDb?.close();
  }

  // Make the snapshot read-only
  try {
    await chmod(targetPath, 0o444);
  } catch {
    // Non-fatal: log but don't fail if chmod doesn't work
    // (e.g., on some filesystems or platforms)
  }

  return targetPath;
}

/**
 * Builds the container path for the runtime DB snapshot.
 *
 * @param workspacePath - The workspace path inside the container
 * @param snapshotName - Optional name for the snapshot file
 * @returns The full path to the snapshot inside the container
 */
export function buildRuntimeDbSnapshotContainerPath(input: {
  workspacePath: string;
  snapshotName?: string;
}): string {
  const snapshotName = input.snapshotName ?? defaultRuntimeDbSnapshotName;
  return path.posix.join(input.workspacePath, ".symphony-runtime", snapshotName);
}

async function removeExistingSnapshotFile(targetPath: string): Promise<void> {
  try {
    const targetStat = await stat(targetPath);
    if (!targetStat.isFile()) {
      throw new SymphonyDbError(
        `Snapshot target path is not a file: ${targetPath}`
      );
    }

    await chmod(targetPath, 0o644).catch(() => {});
    await rm(targetPath, { force: true });
  } catch (error) {
    if (isEnoent(error)) {
      return;
    }

    throw new SymphonyDbError(
      `Failed to prepare snapshot target path: ${targetPath}`,
      { cause: error }
    );
  }
}

function isEnoent(error: unknown): error is Error & { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
