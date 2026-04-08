import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { SymphonyDbError } from "./errors.js";

export const defaultRuntimeDbSnapshotName = "runtime-snapshot.db";

/**
 * Creates a read-only snapshot copy of the Symphony runtime database.
 *
 * The snapshot is a simple file copy that agents can safely inspect without
 * affecting the live runtime database. The file is made read-only to prevent
 * accidental modifications.
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

  // Copy the database file
  try {
    await copyFile(sourcePath, targetPath);
  } catch (error) {
    throw new SymphonyDbError(
      `Failed to copy database snapshot from ${sourcePath} to ${targetPath}`,
      { cause: error }
    );
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
