import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { initializeSymphonyDb, type SymphonyDb } from "@symphony/db";

export type SymphonyTempSqliteHarness = {
  root: string;
  dbFile: string;
  database: SymphonyDb;
  cleanup(): Promise<void>;
};

export async function createTempSymphonySqliteHarness(input: {
  dbFileName?: string;
  rootPrefix?: string;
} = {}): Promise<SymphonyTempSqliteHarness> {
  const root = await mkdtemp(
    path.join(tmpdir(), input.rootPrefix ?? "symphony-test-db-")
  );
  const dbFile = path.join(root, input.dbFileName ?? "symphony.db");
  const database = initializeSymphonyDb({
    dbFile
  });

  return {
    root,
    dbFile,
    database,
    async cleanup() {
      database.close();
      await rm(root, {
        recursive: true,
        force: true
      });
    }
  };
}
