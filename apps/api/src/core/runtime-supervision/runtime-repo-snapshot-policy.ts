import type { SymphonyRuntimeRunStore } from "@symphony/db";
import type { SymphonyRuntimeLaunchTarget } from "../agent-runtime-launch-target.js";
import { captureRepoSnapshot } from "../agent-repo-snapshot.js";

export async function recordRunRepoStartSnapshot(input: {
  runStore: SymphonyRuntimeRunStore;
  runId: string | null;
  launchTarget: SymphonyRuntimeLaunchTarget;
  timeoutMs: number;
}): Promise<void> {
  if (!input.runId) {
    return;
  }

  const repoStart = await captureRepoSnapshot(input.launchTarget, input.timeoutMs);
  await input.runStore.updateRun(input.runId, {
    commitHashStart: repoStart.commitHash,
    repoStart: repoStart.snapshot
  });
}

export async function recordRunRepoEndSnapshot(input: {
  runStore: SymphonyRuntimeRunStore;
  runId: string | null;
  launchTarget: SymphonyRuntimeLaunchTarget;
  timeoutMs: number;
}): Promise<void> {
  if (!input.runId) {
    return;
  }

  const repoEnd = await captureRepoSnapshot(input.launchTarget, input.timeoutMs);
  await input.runStore.updateRun(input.runId, {
    commitHashEnd: repoEnd.commitHash,
    repoEnd: repoEnd.snapshot
  });
}
