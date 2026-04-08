import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  copySymphonyDbSnapshot,
  buildRuntimeDbSnapshotContainerPath,
  defaultRuntimeDbSnapshotName
} from "./db-snapshot.js";
import { initializeSymphonyDb } from "./client.js";
import { SymphonyDbError } from "./errors.js";

const tempDirectories: string[] = [];
const tempFiles: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempFiles.splice(0).map((file) =>
      rm(file, { force: true })
    )
  );
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("copySymphonyDbSnapshot", () => {
  it("copies a database file to the target directory", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "symphony-snapshot-"));
    tempDirectories.push(tempDir);

    const sourceDbPath = path.join(tempDir, "source.db");
    const targetDir = path.join(tempDir, "target");

    // Create a minimal valid SQLite database
    const db = initializeSymphonyDb({ dbFile: sourceDbPath });
    db.close();

    const snapshotPath = await copySymphonyDbSnapshot({
      sourceDbFile: sourceDbPath,
      targetDirectory: targetDir
    });

    expect(snapshotPath).toBe(path.join(targetDir, defaultRuntimeDbSnapshotName));

    const snapshotStat = await stat(snapshotPath);
    expect(snapshotStat.isFile()).toBe(true);
    expect(snapshotStat.mode & 0o444).toBe(0o444); // Read-only
  });

  it("allows custom snapshot names", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "symphony-snapshot-"));
    tempDirectories.push(tempDir);

    const sourceDbPath = path.join(tempDir, "source.db");
    const targetDir = path.join(tempDir, "target");

    const db = initializeSymphonyDb({ dbFile: sourceDbPath });
    db.close();

    const snapshotPath = await copySymphonyDbSnapshot({
      sourceDbFile: sourceDbPath,
      targetDirectory: targetDir,
      snapshotName: "custom-snapshot.db"
    });

    expect(snapshotPath).toBe(path.join(targetDir, "custom-snapshot.db"));

    const snapshotStat = await stat(snapshotPath);
    expect(snapshotStat.isFile()).toBe(true);
  });

  it("throws when source file does not exist", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "symphony-snapshot-"));
    tempDirectories.push(tempDir);

    const sourceDbPath = path.join(tempDir, "nonexistent.db");
    const targetDir = path.join(tempDir, "target");

    await expect(
      copySymphonyDbSnapshot({
        sourceDbFile: sourceDbPath,
        targetDirectory: targetDir
      })
    ).rejects.toThrow(SymphonyDbError);

    await expect(
      copySymphonyDbSnapshot({
        sourceDbFile: sourceDbPath,
        targetDirectory: targetDir
      })
    ).rejects.toThrow(/Source database file not found/);
  });

  it("throws when source path is a directory", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "symphony-snapshot-"));
    tempDirectories.push(tempDir);

    const sourceDir = path.join(tempDir, "sourcedir");
    await mkdir(sourceDir, { recursive: true });
    tempDirectories.push(sourceDir);

    const targetDir = path.join(tempDir, "target");

    await expect(
      copySymphonyDbSnapshot({
        sourceDbFile: sourceDir,
        targetDirectory: targetDir
      })
    ).rejects.toThrow(/Source database path is not a file/);
  });

  it("creates a snapshot that can be opened as a valid SQLite database", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "symphony-snapshot-"));
    tempDirectories.push(tempDir);

    const sourceDbPath = path.join(tempDir, "source.db");
    const targetDir = path.join(tempDir, "target");

    const db = initializeSymphonyDb({ dbFile: sourceDbPath });
    db.close();

    const snapshotPath = await copySymphonyDbSnapshot({
      sourceDbFile: sourceDbPath,
      targetDirectory: targetDir
    });

    // Open the snapshot and verify it's valid
    const snapshotDb = initializeSymphonyDb({ dbFile: snapshotPath });
    expect(snapshotDb.db).toBeDefined();
    snapshotDb.close();
  });

  it("does not modify the source database", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "symphony-snapshot-"));
    tempDirectories.push(tempDir);

    const sourceDbPath = path.join(tempDir, "source.db");
    const targetDir = path.join(tempDir, "target");

    const db = initializeSymphonyDb({ dbFile: sourceDbPath });
    db.close();

    const sourceStatBefore = await stat(sourceDbPath);

    await copySymphonyDbSnapshot({
      sourceDbFile: sourceDbPath,
      targetDirectory: targetDir
    });

    const sourceStatAfter = await stat(sourceDbPath);

    // Source file should be unchanged
    expect(sourceStatBefore.size).toBe(sourceStatAfter.size);
    expect(sourceStatBefore.mtimeMs).toBe(sourceStatAfter.mtimeMs);
  });
});

describe("buildRuntimeDbSnapshotContainerPath", () => {
  it("builds the default snapshot path", () => {
    const result = buildRuntimeDbSnapshotContainerPath({
      workspacePath: "/workspace"
    });

    expect(result).toBe(`/workspace/.symphony-runtime/${defaultRuntimeDbSnapshotName}`);
  });

  it("builds a custom snapshot path", () => {
    const result = buildRuntimeDbSnapshotContainerPath({
      workspacePath: "/workspace",
      snapshotName: "custom.db"
    });

    expect(result).toBe("/workspace/.symphony-runtime/custom.db");
  });

  it("handles workspace paths with trailing slashes", () => {
    const result = buildRuntimeDbSnapshotContainerPath({
      workspacePath: "/workspace/"
    });

    expect(result).toBe(`/workspace/.symphony-runtime/${defaultRuntimeDbSnapshotName}`);
  });
});
