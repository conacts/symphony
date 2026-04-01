import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SymphonyJsonObject } from "@symphony/core/journal";

const execFileAsync = promisify(execFile);
const defaultPatchMaxBytes = 64 * 1024;

type RepoSnapshot = {
  commitHash: string | null;
  snapshot: SymphonyJsonObject;
};

export async function captureRepoSnapshot(
  workspacePath: string,
  timeoutMs: number
): Promise<RepoSnapshot> {
  const capturedAt = new Date().toISOString();

  try {
    const head = await gitCapture(workspacePath, ["rev-parse", "HEAD"], timeoutMs);
    const statusShort = await gitCapture(
      workspacePath,
      ["status", "--short"],
      timeoutMs
    );
    const diffstat = await gitCapture(
      workspacePath,
      ["diff", "--stat", "--no-ext-diff", "HEAD"],
      timeoutMs
    );
    const patchOutput = await gitCapture(
      workspacePath,
      ["diff", "--no-ext-diff", "HEAD"],
      timeoutMs
    );
    const patch = truncateText(patchOutput, defaultPatchMaxBytes);

    return {
      commitHash: blankToNull(head),
      snapshot: {
        captured_at: capturedAt,
        available: true,
        worker_host: null,
        commit_hash: blankToNull(head),
        dirty: statusShort.trim() !== "",
        status_short: blankToNull(statusShort),
        diffstat: blankToNull(diffstat),
        patch: patch.content,
        patch_truncated: patch.truncated
      }
    };
  } catch (error) {
    return {
      commitHash: null,
      snapshot: {
        captured_at: capturedAt,
        available: false,
        worker_host: null,
        error: formatRepoSnapshotError(error)
      }
    };
  }
}

async function gitCapture(
  workspacePath: string,
  args: string[],
  timeoutMs: number
): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: workspacePath,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024
  });

  return `${stdout ?? ""}${stderr ?? ""}`.trimEnd();
}

function truncateText(
  content: string,
  maxBytes: number
): {
  content: string | null;
  truncated: boolean;
} {
  const buffer = Buffer.from(content, "utf8");

  if (buffer.byteLength <= maxBytes) {
    return {
      content: blankToNull(content),
      truncated: false
    };
  }

  return {
    content: blankToNull(buffer.subarray(0, maxBytes).toString("utf8")),
    truncated: true
  };
}

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function formatRepoSnapshotError(error: unknown): string {
  if (error instanceof Error) {
    return `git exception: ${error.message}`;
  }

  return String(error);
}
