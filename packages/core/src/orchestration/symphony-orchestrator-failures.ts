import { SymphonyRuntimeManifestError } from "../runtime-manifest/runtime-manifest-errors.js";
import { SymphonyWorkspaceError } from "../workspace/workspace-identity.js";
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
  error: unknown,
  stage: SymphonyStartupFailureStage,
  backendKind: WorkspaceBackendKind
): SymphonyStartupFailureOrigin {
  const contractOrigin = classifyContractFailureOrigin(error);
  if (contractOrigin) {
    return contractOrigin;
  }

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

function classifyContractFailureOrigin(
  error: unknown
): SymphonyStartupFailureOrigin | null {
  if (error instanceof SymphonyRuntimeManifestError) {
    if (error.issues.some((issue) => issue.path.startsWith("env.repo."))) {
      return "repo_env_contract";
    }

    if (error.issues.some((issue) => issue.path.startsWith("env.host."))) {
      return "host_auth_contract";
    }
  }

  if (readString(asRecord(error)?.code) === "codex_auth_unavailable") {
    return "codex_auth_contract";
  }

  if (error instanceof SymphonyWorkspaceError) {
    if (
      error.code === "workspace_docker_image_missing" ||
      error.code === "workspace_docker_image_invalid"
    ) {
      return "image_tooling_contract";
    }

    if (error.code.startsWith("workspace_docker_")) {
      return "docker_backend_contract";
    }
  }

  return null;
}
