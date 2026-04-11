import {
  type SymphonyLoadedPromptContract,
  type SymphonyLoadedRuntimeManifest
} from "@symphony/runtime-contract";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import {
  resolveHarnessProviderEnvKey
} from "@symphony/agent-harnesses";
import { SymphonyRuntimePolicyError } from "@symphony/runtime-policy";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import type { SymphonyLoadedRuntimePromptTemplate } from "./runtime-app-types.js";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import { validateSourceRepoRuntimeManifest } from "./runtime-manifest-startup-validator.js";
import { loadSymphonyRuntimePolicyConfig } from "./runtime-policy-config.js";
import { loadAdmittedRuntimeRepositories } from "./runtime-admitted-repositories.js";
import { resolveRepositoryForLinearScope } from "./runtime-repository-routing.js";
import {
  resolveRuntimeWorkflowPresetSelection,
  type SymphonyRuntimeWorkflowPresetSelection
} from "./runtime-workflow-preset-selection.js";

type RuntimeServiceBootstrapResult = {
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  harnessProviderEnvKey: string | null;
  admittedRepositories: AdmittedRuntimeRepository[];
  validatedRuntimeManifests: Array<{
    runtimeManifest: SymphonyLoadedRuntimeManifest;
    summary: Record<string, unknown>;
  }>;
  primaryRepository: AdmittedRuntimeRepository | null;
  selectedRuntimeManifestEntry:
    | {
        runtimeManifest: SymphonyLoadedRuntimeManifest;
        summary: Record<string, unknown>;
      }
    | null;
  workflowPresetSelection: SymphonyRuntimeWorkflowPresetSelection;
  promptContract: SymphonyLoadedPromptContract;
  promptTemplate: SymphonyLoadedRuntimePromptTemplate;
};

export async function loadRuntimeServiceBootstrap(input: {
  env: SymphonyRuntimeAppEnv;
  environmentSource: Record<string, string | undefined>;
}): Promise<RuntimeServiceBootstrapResult> {
  const runtimePolicy = loadSymphonyRuntimePolicyConfig({
    environmentSource: input.environmentSource,
    cwd: process.cwd()
  });

  if (runtimePolicy.agent.harness !== "pi") {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      `Runtime execution rejects legacy harness '${runtimePolicy.agent.harness}' for launch/execute. Use agent.harness: "pi".`
    );
  }

  const harnessProviderEnvKey = resolveHarnessProviderEnvKey(runtimePolicy);
  const admittedRepositories =
    input.env.sourceRepos.length > 0
      ? await loadAdmittedRuntimeRepositories(input.env.sourceRepos)
      : [];
  const validatedRuntimeManifests =
    input.env.sourceRepos.length > 0
      ? await Promise.all(
          input.env.sourceRepos.map((sourceRepo) =>
            validateSourceRepoRuntimeManifest(sourceRepo, input.environmentSource)
          )
        )
      : [];
  const primaryRepository =
    admittedRepositories.length > 0
      ? resolveRepositoryForLinearScope(admittedRepositories, runtimePolicy.tracker)
      : null;
  const selectedRuntimeManifestEntry = primaryRepository
    ? validatedRuntimeManifests.find(
        (candidate) =>
          candidate.runtimeManifest.repoRoot === primaryRepository.repoRoot
      ) ?? null
    : null;
  const promptContract =
    primaryRepository?.promptContract ??
    (await loadAdmittedRuntimeRepositories([process.cwd()]))[0].promptContract;
  const workflowPresetSelection = resolveRuntimeWorkflowPresetSelection({
    runtimeManifest: selectedRuntimeManifestEntry?.runtimeManifest ?? null
  });

  return {
    runtimePolicy,
    harnessProviderEnvKey,
    admittedRepositories,
    validatedRuntimeManifests,
    primaryRepository,
    selectedRuntimeManifestEntry,
    workflowPresetSelection,
    promptContract,
    promptTemplate: {
      prompt: promptContract.template.trim(),
      promptTemplate: promptContract.template,
      sourcePath: promptContract.promptPath
    }
  };
}
