import { mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { isEnoent } from "../internal/errors.js";
import {
  SymphonyWorkspaceError,
  symphonyWorkspaceDirectoryName
} from "./workspace-identity.js";

export async function workspaceExists(workspacePath: string): Promise<boolean> {
  try {
    await stat(workspacePath);
    return true;
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }

    throw error;
  }
}

export function buildWorkspacePath(
  issueIdentifier: string,
  root: string
): string {
  const resolvedRoot = path.resolve(root);
  const workspacePath = path.resolve(
    resolvedRoot,
    symphonyWorkspaceDirectoryName(issueIdentifier)
  );
  const rootPrefix = `${resolvedRoot}${path.sep}`;

  if (workspacePath === resolvedRoot) {
    throw new SymphonyWorkspaceError(
      "workspace_equals_root",
      "Workspace path must not equal the workspace root."
    );
  }

  if (!workspacePath.startsWith(rootPrefix)) {
    throw new SymphonyWorkspaceError(
      "workspace_outside_root",
      `Workspace path escaped the root: ${workspacePath}`
    );
  }

  return workspacePath;
}

export async function resolveManagedWorkspacePath(
  issueIdentifier: string,
  root: string,
  ensureRootExists: boolean
): Promise<string> {
  const resolvedRoot = path.resolve(root);

  if (ensureRootExists) {
    await mkdir(resolvedRoot, {
      recursive: true
    });
  }

  const canonicalRoot = await realpath(resolvedRoot);
  const workspacePath = buildWorkspacePath(issueIdentifier, canonicalRoot);
  const rootPrefix = `${canonicalRoot}${path.sep}`;

  try {
    const canonicalWorkspace = await realpath(workspacePath);

    if (canonicalWorkspace === canonicalRoot) {
      throw new SymphonyWorkspaceError(
        "workspace_equals_root",
        "Workspace path must not equal the workspace root."
      );
    }

    if (!canonicalWorkspace.startsWith(rootPrefix)) {
      throw new SymphonyWorkspaceError(
        "workspace_outside_root",
        `Workspace path escaped the root: ${canonicalWorkspace}`
      );
    }

    return canonicalWorkspace;
  } catch (error) {
    if (isEnoent(error)) {
      return workspacePath;
    }

    throw error;
  }
}
