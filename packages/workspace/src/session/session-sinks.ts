import type { WorkspaceBackendEventRecorder } from "../workspace-contracts.js";
import type { WorkspaceSessionEvent } from "./session-events.js";

export type WorkspaceSessionEventSink = (
  event: WorkspaceSessionEvent
) => Promise<void> | void;

const noopWorkspaceSessionEventSink: WorkspaceSessionEventSink = () => undefined;

export function createNoopWorkspaceSessionEventSink(): WorkspaceSessionEventSink {
  return noopWorkspaceSessionEventSink;
}

export function combineWorkspaceSessionEventSinks(
  ...sinks: Array<WorkspaceSessionEventSink | null | undefined>
): WorkspaceSessionEventSink {
  const resolved = sinks.filter(
    (sink): sink is WorkspaceSessionEventSink => typeof sink === "function"
  );

  if (resolved.length === 0) {
    return noopWorkspaceSessionEventSink;
  }

  return async (event) => {
    for (const sink of resolved) {
      await sink(event);
    }
  };
}

export function createWorkspaceSessionLifecycleSink(
  lifecycleRecorder: WorkspaceBackendEventRecorder | undefined
): WorkspaceSessionEventSink {
  if (!lifecycleRecorder) {
    return noopWorkspaceSessionEventSink;
  }

  return async (event) => {
    await lifecycleRecorder({
      eventType: `workspace_session_${event.type}`,
      message: describeWorkspaceSessionEvent(event),
      payload: {
        workspaceSession: event
      },
      recordedAt: event.recordedAt
    });
  };
}

function describeWorkspaceSessionEvent(event: WorkspaceSessionEvent): string {
  switch (event.type) {
    case "command_started":
      return `Workspace session command started in ${event.containerName}.`;
    case "command_completed":
      return `Workspace session command completed in ${event.containerName}.`;
    case "command_failed":
      return `Workspace session command failed in ${event.containerName}.`;
  }
}
