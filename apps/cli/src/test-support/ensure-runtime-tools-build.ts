import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../"
);

let pendingBuild: Promise<void> | null = null;

export async function ensureRuntimeToolsBuild(): Promise<void> {
  if (!pendingBuild) {
    pendingBuild = execFileAsync(
      "pnpm",
      ["--filter", "@symphony/runtime-tools", "build"],
      {
        cwd: repoRoot
      }
    ).then(() => undefined);
  }

  await pendingBuild;
}
