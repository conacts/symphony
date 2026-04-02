import path from "node:path";
import {
  loadSymphonyPromptContract,
  type SymphonyLoadedPromptContract,
  type SymphonyPromptContractLoadOptions
} from "./prompt-contract.js";
import {
  loadSymphonyRuntimeManifest,
  type SymphonyLoadedRuntimeManifest,
  type SymphonyRuntimeManifestLoadOptions
} from "./runtime-manifest.js";

export type SymphonyRuntimeContractLoadOptions = {
  repoRoot: string;
  manifestPath?: SymphonyRuntimeManifestLoadOptions["manifestPath"];
  promptPath?: SymphonyPromptContractLoadOptions["promptPath"];
};

export type SymphonyLoadedRuntimeContract = {
  repoRoot: string;
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  promptContract: SymphonyLoadedPromptContract;
};

export function defaultSymphonyRuntimeContractPaths(repoRoot = process.cwd()): {
  repoRoot: string;
  manifestPath: string;
  promptPath: string;
} {
  const resolvedRepoRoot = path.resolve(repoRoot);

  return {
    repoRoot: resolvedRepoRoot,
    manifestPath: path.join(resolvedRepoRoot, ".symphony", "runtime.ts"),
    promptPath: path.join(resolvedRepoRoot, ".symphony", "prompt.md")
  };
}

export async function loadSymphonyRuntimeContract(
  input: string | SymphonyRuntimeContractLoadOptions
): Promise<SymphonyLoadedRuntimeContract> {
  const repoRoot =
    typeof input === "string"
      ? path.resolve(input)
      : path.resolve(input.repoRoot);

  const runtimeManifest = await loadSymphonyRuntimeManifest({
    repoRoot,
    ...(typeof input === "string" || !input.manifestPath
      ? {}
      : { manifestPath: input.manifestPath })
  });
  const promptContract = loadSymphonyPromptContract({
    repoRoot,
    ...(typeof input === "string" || !input.promptPath
      ? {}
      : { promptPath: input.promptPath })
  });

  return {
    repoRoot,
    runtimeManifest,
    promptContract
  };
}
