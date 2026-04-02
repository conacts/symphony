import { asJsonObject } from "../internal/json.js";
import { asRecord, readString } from "../internal/records.js";
import type {
  SymphonyStartupFailureOrigin,
  SymphonyStartupFailureStage
} from "./symphony-orchestrator-types.js";
import type {
  WorkspaceBackendKind,
  WorkspaceManifestLifecyclePhase
} from "../workspace/workspace-backend.js";
import type { SymphonyJsonObject } from "../journal/symphony-run-journal-types.js";

const failureRetryBaseMs = 10_000;

export function failureRetryDelay(
  attempt: number,
  maxRetryBackoffMs: number
): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(
    failureRetryBaseMs * (1 << exponent),
    maxRetryBackoffMs
  );
}

export function classifyStartupFailureOrigin(
  stage: SymphonyStartupFailureStage,
  backendKind: WorkspaceBackendKind
): SymphonyStartupFailureOrigin {
  if (stage === "runtime_session_start") {
    return "codex_startup";
  }

  if (stage === "runtime_launch") {
    return "runtime_launch";
  }

  if (backendKind === "docker") {
    return "docker_lifecycle";
  }

  return "workspace_lifecycle";
}

export function extractWorkspaceManifestLifecycleFailure(input: unknown): {
  manifestLifecyclePhase: WorkspaceManifestLifecyclePhase;
  manifestLifecycleStepName: string | null;
  manifestLifecycle: SymphonyJsonObject | null;
} | null {
  if (!(input instanceof Error)) {
    return null;
  }

  const candidate = asRecord(input);
  const manifestLifecyclePhase = readString(
    candidate?.manifestLifecyclePhase
  );

  return manifestLifecyclePhase
    ? {
        manifestLifecyclePhase:
          manifestLifecyclePhase as WorkspaceManifestLifecyclePhase,
        manifestLifecycleStepName: readString(
          candidate?.manifestLifecycleStepName
        ),
        manifestLifecycle: asJsonObject(candidate?.manifestLifecycle) ?? null
      }
    : null;
}

export function isFatalRuntimeError(error: unknown): boolean {
  return error instanceof Error && asRecord(error)?.fatal === true;
}
