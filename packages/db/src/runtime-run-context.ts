import type { SymphonyRuntimeLaunchTarget } from "@symphony/contracts";
import { symphonyRunRuntimeContextTable } from "./schema.js";

export type SymphonyRuntimeRunContext = {
  harness: "pi" | null;
  threadId: string | null;
  processId: string | null;
  model: string | null;
  reasoningEffort: string | null;
  profile: string | null;
  providerId: string | null;
  providerName: string | null;
  authMode: string | null;
  providerEnvKey: string | null;
  launchTarget: SymphonyRuntimeLaunchTarget | null;
};

export function emptyRuntimeRunContext(): SymphonyRuntimeRunContext {
  return {
    harness: null,
    threadId: null,
    processId: null,
    model: null,
    reasoningEffort: null,
    profile: null,
    providerId: null,
    providerName: null,
    authMode: null,
    providerEnvKey: null,
    launchTarget: null
  };
}

export function buildRuntimeRunContextMap(
  rows: Array<typeof symphonyRunRuntimeContextTable.$inferSelect>
): Map<string, SymphonyRuntimeRunContext> {
  return new Map(rows.map((row) => [row.runId, mapRuntimeRunContextRow(row)] as const));
}

export function mapRuntimeRunContextRow(
  row: typeof symphonyRunRuntimeContextTable.$inferSelect | null | undefined
): SymphonyRuntimeRunContext {
  if (!row) {
    return emptyRuntimeRunContext();
  }

  return {
    harness: normalizeHarnessKind(row.harnessKind),
    threadId: row.threadId ?? null,
    processId: row.processId ?? null,
    model: row.model ?? null,
    reasoningEffort: row.reasoningEffort ?? null,
    profile: row.profile ?? null,
    providerId: row.providerId ?? null,
    providerName: row.providerName ?? null,
    authMode: row.authMode ?? null,
    providerEnvKey: row.providerEnvKey ?? null,
    launchTarget: normalizeLaunchTarget(row.launchTarget)
  };
}

function normalizeHarnessKind(value: string | null | undefined): "pi" | null {
  return value === "pi" ? "pi" : null;
}

function normalizeLaunchTarget(value: Record<string, unknown> | null): SymphonyRuntimeLaunchTarget | null {
  if (!value) {
    return null;
  }

  if (
    value.kind === "container" &&
    typeof value.hostLaunchPath === "string" &&
    typeof value.runtimeWorkspacePath === "string" &&
    typeof value.containerName === "string" &&
    typeof value.shell === "string"
  ) {
    return {
      kind: "container",
      hostLaunchPath: value.hostLaunchPath,
      hostWorkspacePath:
        typeof value.hostWorkspacePath === "string" ? value.hostWorkspacePath : null,
      runtimeWorkspacePath: value.runtimeWorkspacePath,
      containerId: typeof value.containerId === "string" ? value.containerId : null,
      containerName: value.containerName,
      shell: value.shell
    };
  }

  return null;
}
