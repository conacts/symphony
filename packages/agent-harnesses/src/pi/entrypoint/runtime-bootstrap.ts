import { dirname, resolve } from "node:path";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager
} from "@mariozechner/pi-coding-agent";
import type { Api, Model } from "@mariozechner/pi-ai";
import { normalizePiThinkingLevel } from "../model-selection.js";
import type { PiSdkRunnerInput } from "../sdk-runner-contract.js";
import type { PiSdkRunnerRuntime } from "./definition.js";

export async function bootstrapPiSdkRunner(
  input: PiSdkRunnerInput
): Promise<PiSdkRunnerRuntime> {
  const resolvedAgentDir = resolveAgentDir(input.workspace.agentDir);
  const authStorage = AuthStorage.create(
    resolve(resolvedAgentDir, "auth.json")
  );
  const modelRegistry = ModelRegistry.create(
    authStorage,
    resolve(resolvedAgentDir, "models.json")
  );
  const settingsManager = SettingsManager.create(
    input.workspace.cwd,
    resolvedAgentDir
  );
  const resourceLoader = new DefaultResourceLoader({
    cwd: input.workspace.cwd,
    agentDir: resolvedAgentDir,
    settingsManager
  });
  await resourceLoader.reload();

  const model = resolveRunnerModel(input, modelRegistry);
  const thinkingLevel = (
    normalizePiThinkingLevel(input.model.reasoningEffort) ?? "medium"
  ) as ThinkingLevel;
  const sessionManager = SessionManager.open(
    input.workspace.sessionFile,
    dirname(input.workspace.sessionFile),
    input.workspace.cwd
  );
  const { session } = await createAgentSession({
    cwd: input.workspace.cwd,
    agentDir: resolvedAgentDir,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel,
    sessionManager,
    settingsManager,
    resourceLoader
  });

  return {
    bootstrap: input,
    resolvedAgentDir,
    model,
    session,
    sessionId: session.sessionId,
    threadId: session.sessionId
  };
}

function resolveAgentDir(agentDir: string | null): string {
  const resolvedAgentDir = (agentDir ?? getAgentDir()).trim();
  if (resolvedAgentDir === "") {
    throw new TypeError("Pi SDK runner requires a non-empty agent directory.");
  }

  return resolvedAgentDir;
}

function resolveRunnerModel(
  input: PiSdkRunnerInput,
  modelRegistry: ModelRegistry
): Model<Api> {
  if (input.model.providerId) {
    const providerModel = modelRegistry.find(
      input.model.providerId,
      input.model.id
    );
    if (providerModel) {
      return providerModel;
    }
  }

  const exactMatches = modelRegistry
    .getAll()
    .filter((model) => model.id === input.model.id);
  if (exactMatches.length === 1) {
    return exactMatches[0]!;
  }

  if (exactMatches.length > 1) {
    throw new TypeError(
      `Pi SDK runner model ${JSON.stringify(
        input.model.id
      )} is ambiguous without an explicit provider id.`
    );
  }

  throw new TypeError(
    `Pi SDK runner could not resolve model ${JSON.stringify(
      input.model.id
    )}.`
  );
}
