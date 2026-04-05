import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { HarnessSessionError } from "./session-types.js";

export async function validateWorkspaceCwd(
  workspacePath: string,
  workspaceRoot: string
): Promise<string> {
  const expandedWorkspace = path.resolve(workspacePath);
  const expandedRoot = path.resolve(workspaceRoot);
  const expandedRootPrefix = `${expandedRoot}${path.sep}`;

  try {
    const canonicalWorkspace = await realpath(expandedWorkspace);
    const canonicalRoot = await realpath(expandedRoot);
    const canonicalRootPrefix = `${canonicalRoot}${path.sep}`;

    if (canonicalWorkspace === canonicalRoot) {
      throw new HarnessSessionError(
        "invalid_workspace_cwd",
        `Workspace path must not equal the workspace root: ${canonicalWorkspace}`,
        {
          reason: "workspace_root",
          path: canonicalWorkspace
        }
      );
    }

    if (canonicalWorkspace.startsWith(canonicalRootPrefix)) {
      return canonicalWorkspace;
    }

    if (expandedWorkspace.startsWith(expandedRootPrefix)) {
      throw new HarnessSessionError(
        "invalid_workspace_cwd",
        `Workspace path escaped the workspace root via symlink: ${expandedWorkspace}`,
        {
          reason: "symlink_escape",
          path: expandedWorkspace,
          root: canonicalRoot
        }
      );
    }

    throw new HarnessSessionError(
      "invalid_workspace_cwd",
      `Workspace path is outside the workspace root: ${canonicalWorkspace}`,
      {
        reason: "outside_workspace_root",
        path: canonicalWorkspace,
        root: canonicalRoot
      }
    );
  } catch (error) {
    if (error instanceof HarnessSessionError) {
      throw error;
    }

    throw new HarnessSessionError(
      "invalid_workspace_cwd",
      `Workspace path could not be resolved: ${expandedWorkspace}`,
      {
        reason: "path_unreadable",
        path: expandedWorkspace,
        error: error instanceof Error ? error.message : String(error)
      }
    );
  }
}

export async function ensureWorkspaceCwd(
  workspacePath: string,
  workspaceRoot: string
): Promise<string> {
  await mkdir(workspacePath, {
    recursive: true
  });

  return await validateWorkspaceCwd(workspacePath, workspaceRoot);
}
