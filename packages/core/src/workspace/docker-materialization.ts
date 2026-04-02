import { mkdir, rm, stat } from "node:fs/promises";
import { isEnoent } from "../internal/errors.js";
import { workspaceExists } from "./workspace-paths.js";
import { SymphonyWorkspaceError } from "./workspace-identity.js";

export async function ensureMaterializedWorkspace(
  workspacePath: string
): Promise<boolean> {
  try {
    const existing = await stat(workspacePath);
    if (existing.isDirectory()) {
      return false;
    }

    await rm(workspacePath, {
      recursive: true,
      force: true
    });
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
  }

  await mkdir(workspacePath, {
    recursive: true
  });

  return true;
}

export async function removeMaterializedWorkspace(
  workspacePath: string
): Promise<"removed" | "missing"> {
  const existedBeforeDelete = await workspaceExists(workspacePath);

  await rm(workspacePath, {
    recursive: true,
    force: true
  });

  const existsAfterDelete = await workspaceExists(workspacePath);
  if (existsAfterDelete) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_remove_failed",
      `Docker workspace cleanup did not remove ${workspacePath}.`
    );
  }

  return existedBeforeDelete ? "removed" : "missing";
}
