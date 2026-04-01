import {
  createLocalSymphonyWorkspaceManager,
  type SymphonyWorkspaceManager
} from "./local-symphony-workspace-manager.js";

export type WorkspaceBackend = SymphonyWorkspaceManager;

export function createLocalWorkspaceBackend(
  options: Parameters<typeof createLocalSymphonyWorkspaceManager>[0] = {}
): WorkspaceBackend {
  return createLocalSymphonyWorkspaceManager(options);
}
