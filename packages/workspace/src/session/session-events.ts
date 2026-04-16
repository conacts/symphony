export type WorkspaceSessionKind = "docker_container";

export type WorkspaceSessionCommandMetadata = Record<string, unknown>;

export type WorkspaceSessionCommandStartedEvent = {
  type: "command_started";
  sessionKind: WorkspaceSessionKind;
  containerName: string;
  workspacePath: string;
  cwd: string;
  shell: string;
  user: string;
  command: string;
  timeoutMs: number;
  envKeys: string[];
  metadata: WorkspaceSessionCommandMetadata | null;
  recordedAt: string;
};

export type WorkspaceSessionCommandCompletedEvent = {
  type: "command_completed";
  sessionKind: WorkspaceSessionKind;
  containerName: string;
  workspacePath: string;
  cwd: string;
  shell: string;
  user: string;
  command: string;
  timeoutMs: number;
  envKeys: string[];
  metadata: WorkspaceSessionCommandMetadata | null;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  recordedAt: string;
};

export type WorkspaceSessionCommandFailedEvent = {
  type: "command_failed";
  sessionKind: WorkspaceSessionKind;
  containerName: string;
  workspacePath: string;
  cwd: string;
  shell: string;
  user: string;
  command: string;
  timeoutMs: number;
  envKeys: string[];
  metadata: WorkspaceSessionCommandMetadata | null;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  recordedAt: string;
};

export type WorkspaceSessionEvent =
  | WorkspaceSessionCommandStartedEvent
  | WorkspaceSessionCommandCompletedEvent
  | WorkspaceSessionCommandFailedEvent;
