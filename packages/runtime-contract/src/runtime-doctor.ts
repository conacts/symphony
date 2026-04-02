import path from "node:path";
import {
  buildMockSymphonyPromptContractPayload,
  renderSymphonyPromptContract,
  type SymphonyPromptContractPayload
} from "./prompt-contract.js";
import { loadSymphonyRuntimeContract } from "./repo-contract.js";
import {
  buildSymphonyRuntimePostgresConnectionString,
  resolveSymphonyRuntimeEnvBundle,
  resolveSymphonyRuntimeHostEnv
} from "./runtime-manifest-env.js";
import type {
  SymphonyResolvedRuntimeEnvBundleSummary,
  SymphonyResolvedRuntimePostgresService,
  SymphonyResolvedRuntimeService,
  SymphonyRuntimeEnvironmentContext,
  SymphonyRuntimeEnvironmentSource,
  SymphonyRuntimePostgresService
} from "./runtime-manifest-contract.js";

export type SymphonyRuntimeDoctorInput = {
  repoRoot: string;
  manifestPath?: string;
  promptPath?: string;
  environmentSource?: SymphonyRuntimeEnvironmentSource;
  promptPayload?: SymphonyPromptContractPayload;
  runtime?: Partial<SymphonyRuntimeEnvironmentContext>;
};

export type SymphonyRuntimeDoctorServiceSummary = {
  serviceKey: string;
  type: "postgres";
  host: string;
  port: number;
  database: string;
  username: string;
  passwordConfigured: boolean;
  connectionStringConfigured: boolean;
  initStepNames: string[];
  readiness: {
    timeoutMs?: number;
    intervalMs?: number;
    retries?: number;
  } | null;
  resources: {
    memoryMb?: number;
    cpuShares?: number;
  } | null;
};

export type SymphonyRuntimeDoctorReport = {
  repoRoot: string;
  manifestPath: string;
  promptPath: string;
  schemaVersion: number;
  workspace: {
    packageManager: string;
    workingDirectory: string;
  };
  runtime: {
    issueIdentifier: string;
    workspaceKey: string;
    workspacePath: string;
    backendKind: SymphonyRuntimeEnvironmentContext["backendKind"];
  };
  env: {
    requiredHostKeys: string[];
    optionalHostKeys: string[];
    presentRequiredHostKeys: string[];
    presentOptionalHostKeys: string[];
    injectedKeys: string[];
    staticBindingKeys: string[];
    runtimeBindingKeys: string[];
    serviceBindingKeys: string[];
  };
  services: SymphonyRuntimeDoctorServiceSummary[];
  prompt: {
    variables: string[];
    renderedCharacters: number;
    renderedLines: number;
  };
};

export async function runSymphonyRuntimeDoctor(
  input: SymphonyRuntimeDoctorInput
): Promise<SymphonyRuntimeDoctorReport> {
  const contract = await loadSymphonyRuntimeContract({
    repoRoot: input.repoRoot,
    ...(input.manifestPath ? { manifestPath: input.manifestPath } : {}),
    ...(input.promptPath ? { promptPath: input.promptPath } : {})
  });
  const promptPayload =
    input.promptPayload ?? buildMockSymphonyPromptContractPayload();
  const runtime =
    buildMockSymphonyRuntimeEnvironmentContext(contract.repoRoot, promptPayload, input.runtime);
  const resolvedServices = resolveDeclaredServices(
    contract.runtimeManifest.manifest.services
  );
  const hostEnv = resolveSymphonyRuntimeHostEnv({
    manifest: contract.runtimeManifest.manifest,
    environmentSource: input.environmentSource ?? process.env,
    manifestPath: contract.runtimeManifest.manifestPath
  });
  const envBundle = resolveSymphonyRuntimeEnvBundle({
    manifest: contract.runtimeManifest.manifest,
    environmentSource: input.environmentSource ?? process.env,
    runtime,
    services: resolvedServices,
    manifestPath: contract.runtimeManifest.manifestPath
  });
  const renderedPrompt = renderSymphonyPromptContract({
    template: contract.promptContract.template,
    payload: promptPayload,
    promptPath: contract.promptContract.promptPath
  });

  return {
    repoRoot: contract.repoRoot,
    manifestPath: contract.runtimeManifest.manifestPath,
    promptPath: contract.promptContract.promptPath,
    schemaVersion: contract.runtimeManifest.manifest.schemaVersion,
    workspace: {
      packageManager: contract.runtimeManifest.manifest.workspace.packageManager,
      workingDirectory: contract.runtimeManifest.manifest.workspace.workingDirectory
    },
    runtime: {
      issueIdentifier: runtime.issueIdentifier,
      workspaceKey: runtime.workspaceKey,
      workspacePath: runtime.workspacePath,
      backendKind: runtime.backendKind
    },
    env: buildDoctorEnvSummary(hostEnv, envBundle.summary),
    services: Object.entries(contract.runtimeManifest.manifest.services).map(
      ([serviceKey, service]) => summarizeService(serviceKey, service)
    ),
    prompt: {
      variables: contract.promptContract.variables,
      renderedCharacters: renderedPrompt.length,
      renderedLines: renderedPrompt.split(/\r?\n/).length
    }
  };
}

export function buildMockSymphonyRuntimeEnvironmentContext(
  repoRoot: string,
  promptPayload: SymphonyPromptContractPayload = buildMockSymphonyPromptContractPayload(),
  overrides: Partial<SymphonyRuntimeEnvironmentContext> = {}
): SymphonyRuntimeEnvironmentContext {
  return {
    issueId: promptPayload.issue.id,
    issueIdentifier: promptPayload.issue.identifier,
    runId: promptPayload.run.id,
    workspaceKey: promptPayload.issue.identifier,
    workspacePath: path.join(repoRoot, ".symphony", "doctor-workspace"),
    backendKind: "docker",
    ...overrides
  };
}

function resolveDeclaredServices(
  services: Record<string, SymphonyRuntimePostgresService>
): Record<string, SymphonyResolvedRuntimeService> {
  return Object.fromEntries(
    Object.entries(services).map(([serviceKey, service]) => [
      serviceKey,
      resolveDeclaredPostgresService(serviceKey, service)
    ])
  );
}

function resolveDeclaredPostgresService(
  serviceKey: string,
  service: SymphonyRuntimePostgresService
): SymphonyResolvedRuntimePostgresService {
  return {
    type: "postgres",
    serviceKey,
    host: service.hostname ?? serviceKey,
    port: service.port ?? 5_432,
    database: service.database,
    username: service.username,
    password: service.password,
    connectionString: buildSymphonyRuntimePostgresConnectionString({
      host: service.hostname ?? serviceKey,
      port: service.port ?? 5_432,
      database: service.database,
      username: service.username,
      password: service.password
    })
  };
}

function buildDoctorEnvSummary(
  hostEnv: ReturnType<typeof resolveSymphonyRuntimeHostEnv>,
  envBundleSummary: SymphonyResolvedRuntimeEnvBundleSummary
): SymphonyRuntimeDoctorReport["env"] {
  return {
    requiredHostKeys: envBundleSummary.requiredHostKeys,
    optionalHostKeys: envBundleSummary.optionalHostKeys,
    presentRequiredHostKeys: Object.keys(hostEnv.required).sort(),
    presentOptionalHostKeys: Object.keys(hostEnv.optional).sort(),
    injectedKeys: envBundleSummary.injectedKeys,
    staticBindingKeys: envBundleSummary.staticBindingKeys,
    runtimeBindingKeys: envBundleSummary.runtimeBindingKeys,
    serviceBindingKeys: envBundleSummary.serviceBindingKeys
  };
}

function summarizeService(
  serviceKey: string,
  service: SymphonyRuntimePostgresService
): SymphonyRuntimeDoctorServiceSummary {
  return {
    serviceKey,
    type: "postgres",
    host: service.hostname ?? serviceKey,
    port: service.port ?? 5_432,
    database: service.database,
    username: service.username,
    passwordConfigured: service.password !== "",
    connectionStringConfigured: true,
    initStepNames: service.init?.map((step) => step.name) ?? [],
    readiness: service.readiness ?? null,
    resources: service.resources ?? null
  };
}
