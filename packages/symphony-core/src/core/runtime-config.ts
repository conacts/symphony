import type { SymphonyRepositoryTarget } from "./repository-target.js";

export type SymphonyRuntimeConfig = {
  repositoryTarget: SymphonyRepositoryTarget;
  pollIntervalMs: number;
  realtimeEnabled: boolean;
};
