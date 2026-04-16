import type {
  WorkspaceSessionEvent,
  WorkspaceSessionKind
} from "./session-events.js";
import {
  createNoopWorkspaceSessionEventSink,
  type WorkspaceSessionEventSink
} from "./session-sinks.js";

export abstract class BaseWorkspaceSession {
  readonly #kind: WorkspaceSessionKind;
  readonly #sink: WorkspaceSessionEventSink;

  protected constructor(input: {
    kind: WorkspaceSessionKind;
    sink?: WorkspaceSessionEventSink;
  }) {
    this.#kind = input.kind;
    this.#sink = input.sink ?? createNoopWorkspaceSessionEventSink();
  }

  protected get sessionKind(): WorkspaceSessionKind {
    return this.#kind;
  }

  protected async emitSessionEvent(
    event: WorkspaceSessionEvent
  ): Promise<void> {
    await this.#sink(event);
  }
}
