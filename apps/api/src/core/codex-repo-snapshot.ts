import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SymphonyJsonObject } from "@symphony/run-journal";
import type { CodexRuntimeLaunchTarget } from "./codex-runtime-launch-target.js";

const execFileAsync = promisify(execFile);
const defaultPatchMaxBytes = 64 * 1024;

type RepoSnapshot = {
  commitHash: string | null;
  snapshot: SymphonyJsonObject;
};

export async function captureRepoSnapshot(
  launchTarget: CodexRuntimeLaunchTarget,
  timeoutMs: number
): Promise<RepoSnapshot> {
  const capturedAt = new Date().toISOString();
  const context = buildRepoSnapshotContext(launchTarget);

  try {
    const head = await gitCapture(launchTarget, ["rev-parse", "HEAD"], timeoutMs);
    const statusShort = await gitCapture(
      launchTarget,
      ["status", "--short"],
      timeoutMs
    );
    const diffstat = await gitCapture(
      launchTarget,
      ["diff", "--stat", "--no-ext-diff", "HEAD"],
      timeoutMs
    );
    const patchOutput = await gitCapture(
      launchTarget,
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
        source: context.source,
        workspace_path: context.workspacePath,
        host_workspace_path: context.hostWorkspacePath,
        host_launch_path: context.hostLaunchPath,
        container_name: context.containerName,
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
        source: context.source,
        workspace_path: context.workspacePath,
        host_workspace_path: context.hostWorkspacePath,
        host_launch_path: context.hostLaunchPath,
        container_name: context.containerName,
        error: formatRepoSnapshotError(error)
      }
    };
  }
}

async function gitCapture(
  launchTarget: CodexRuntimeLaunchTarget,
  args: string[],
  timeoutMs: number
): Promise<string> {
  const command =
    launchTarget.hostWorkspacePath !== null
      ? {
          file: "git",
          args,
          options: {
            cwd: launchTarget.hostWorkspacePath,
            timeout: timeoutMs,
            maxBuffer: 8 * 1024 * 1024
          }
        }
      : {
          file: "docker",
          args: [
            "exec",
            "--workdir",
            launchTarget.runtimeWorkspacePath,
            launchTarget.containerName,
            launchTarget.shell,
            "-lc",
            buildGitShellCommand(args)
          ],
          options: {
            cwd: launchTarget.hostLaunchPath,
            timeout: timeoutMs,
            maxBuffer: 8 * 1024 * 1024
          }
        };
  const { stdout, stderr } = await execFileAsync(command.file, command.args, command.options);

  return `${stdout ?? ""}${stderr ?? ""}`.trimEnd();
}

function buildGitShellCommand(args: string[]): string {
  return ["git", ...args.map((part) => shellEscape(part))].join(" ");
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
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

function buildRepoSnapshotContext(launchTarget: CodexRuntimeLaunchTarget): {
  source: "bind_mount" | "container_exec";
  workspacePath: string;
  hostWorkspacePath: string | null;
  hostLaunchPath: string;
  containerName: string | null;
} {
  return {
    source:
      launchTarget.hostWorkspacePath === null ? "container_exec" : "bind_mount",
    workspacePath:
      launchTarget.hostWorkspacePath ?? launchTarget.runtimeWorkspacePath,
    hostWorkspacePath: launchTarget.hostWorkspacePath,
    hostLaunchPath: launchTarget.hostLaunchPath,
    containerName: launchTarget.containerName
  };
}
