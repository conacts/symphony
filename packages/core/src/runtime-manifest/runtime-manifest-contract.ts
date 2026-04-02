import path from "node:path";

export const defaultSymphonyRuntimeManifestRelativePath = ".symphony/runtime.ts";
export const defaultSymphonyRuntimeWorkingDirectory = ".";
export const defaultSymphonyRuntimePostgresPort = 5_432;

export type SymphonyRuntimeWorkspacePackageManager =
  | "pnpm"
  | "npm"
  | "yarn"
  | "bun";

export type SymphonyRuntimeServiceBindingValue =
  | "connectionString"
  | "host"
  | "port"
  | "database"
  | "username"
  | "password";

export type SymphonyRuntimeBindingValue =
  | "issueId"
  | "issueIdentifier"
  | "runId"
  | "workspaceKey"
  | "workspacePath"
  | "backendKind";

export type SymphonyRuntimeStep = {
  name: string;
  run: string;
  cwd?: string;
  timeoutMs?: number;
};

export type SymphonyRuntimePostgresServiceResources = {
  memoryMb?: number;
  cpuShares?: number;
};

export type SymphonyRuntimePostgresServiceReadiness = {
  timeoutMs?: number;
  intervalMs?: number;
  retries?: number;
};

export type SymphonyRuntimePostgresService = {
  type: "postgres";
  image: string;
  hostname?: string;
  port?: number;
  database: string;
  username: string;
  password: string;
  resources?: SymphonyRuntimePostgresServiceResources;
  readiness?: SymphonyRuntimePostgresServiceReadiness;
  init?: SymphonyRuntimeStep[];
};

export type SymphonyRuntimeService = SymphonyRuntimePostgresService;

export type SymphonyRuntimeStaticEnvBinding = {
  kind: "static";
  value: string;
};

export type SymphonyRuntimeServiceEnvBinding = {
  kind: "service";
  service: string;
  value: SymphonyRuntimeServiceBindingValue;
};

export type SymphonyRuntimeRuntimeEnvBinding = {
  kind: "runtime";
  value: SymphonyRuntimeBindingValue;
};

export type SymphonyRuntimeEnvBinding =
  | SymphonyRuntimeStaticEnvBinding
  | SymphonyRuntimeServiceEnvBinding
  | SymphonyRuntimeRuntimeEnvBinding;

export type SymphonyRuntimeEnv = {
  host: {
    required: string[];
    optional: string[];
  };
  inject: Record<string, SymphonyRuntimeEnvBinding>;
};

export type SymphonyRuntimeLifecycle = {
  bootstrap: SymphonyRuntimeStep[];
  migrate: SymphonyRuntimeStep[];
  verify: [SymphonyRuntimeStep, ...SymphonyRuntimeStep[]];
  seed?: SymphonyRuntimeStep[];
  cleanup?: SymphonyRuntimeStep[];
};

export type SymphonyRuntimeWorkspace = {
  packageManager: SymphonyRuntimeWorkspacePackageManager;
  workingDirectory?: string;
};

export type SymphonyRuntimeManifest = {
  schemaVersion: 1;
  workspace: SymphonyRuntimeWorkspace;
  services?: Record<string, SymphonyRuntimeService>;
  env: SymphonyRuntimeEnv;
  lifecycle: SymphonyRuntimeLifecycle;
};

export type SymphonyRuntimeWorkspaceInput = SymphonyRuntimeWorkspace;
export type SymphonyRuntimeServiceInput = SymphonyRuntimeService;
export type SymphonyRuntimePostgresServiceInput = SymphonyRuntimePostgresService;
export type SymphonyRuntimeEnvInput = SymphonyRuntimeEnv;
export type SymphonyRuntimeHostEnv = SymphonyRuntimeEnv["host"];
export type SymphonyRuntimeHostEnvInput = SymphonyRuntimeHostEnv;
export type SymphonyRuntimeEnvBindingInput = SymphonyRuntimeEnvBinding;
export type SymphonyRuntimeLifecycleInput = SymphonyRuntimeLifecycle;
export type SymphonyRuntimeLifecycleStep = SymphonyRuntimeStep;
export type SymphonyRuntimeLifecycleStepInput = SymphonyRuntimeStep;
export type SymphonyRuntimeManifestInput = SymphonyRuntimeManifest;

export type SymphonyNormalizedRuntimeWorkspace = {
  packageManager: SymphonyRuntimeWorkspacePackageManager;
  workingDirectory: string;
};

export type SymphonyNormalizedRuntimePostgresService = Omit<
  SymphonyRuntimePostgresService,
  "hostname" | "port" | "init"
> & {
  hostname: string;
  port: number;
  init: SymphonyRuntimeStep[];
};

export type SymphonyNormalizedRuntimeService =
  SymphonyNormalizedRuntimePostgresService;

export type SymphonyNormalizedRuntimeManifest = {
  schemaVersion: 1;
  workspace: SymphonyNormalizedRuntimeWorkspace;
  services: Record<string, SymphonyNormalizedRuntimeService>;
  env: SymphonyRuntimeEnv;
  lifecycle: {
    bootstrap: SymphonyRuntimeStep[];
    migrate: SymphonyRuntimeStep[];
    verify: [SymphonyRuntimeStep, ...SymphonyRuntimeStep[]];
    seed: SymphonyRuntimeStep[];
    cleanup: SymphonyRuntimeStep[];
  };
};

export type SymphonyRuntimeManifestValidationOptions = {
  manifestPath?: string | null;
};

export type SymphonyRuntimeManifestLoadOptions = {
  repoRoot: string;
  manifestPath?: string;
};

export type SymphonyRuntimeEnvironmentSource = Record<string, string | undefined>;

export type SymphonyRuntimeEnvironmentBackendKind = "local" | "docker";

export type SymphonyRuntimeEnvironmentContext = {
  issueId: string | null;
  issueIdentifier: string;
  runId: string | null;
  workspaceKey: string;
  workspacePath: string;
  backendKind: SymphonyRuntimeEnvironmentBackendKind;
};

export type SymphonyResolvedRuntimeHostEnv = {
  required: Record<string, string>;
  optional: Record<string, string>;
};

export type SymphonyResolvedRuntimePostgresService = {
  type: "postgres";
  serviceKey: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectionString: string;
};

export type SymphonyResolvedRuntimeService = SymphonyResolvedRuntimePostgresService;

export type SymphonyResolvedRuntimeEnvBundleSummary = {
  source: "manifest";
  injectedKeys: string[];
  requiredHostKeys: string[];
  optionalHostKeys: string[];
  staticBindingKeys: string[];
  runtimeBindingKeys: string[];
  serviceBindingKeys: string[];
};

export type SymphonyResolvedRuntimeEnvBundle = {
  source: "manifest";
  values: Record<string, string>;
  summary: SymphonyResolvedRuntimeEnvBundleSummary;
};

export type SymphonyRuntimeHostEnvResolutionInput = {
  manifest: SymphonyNormalizedRuntimeManifest;
  environmentSource: SymphonyRuntimeEnvironmentSource;
  manifestPath?: string | null;
};

export type SymphonyRuntimeEnvResolutionInput = {
  manifest: SymphonyNormalizedRuntimeManifest;
  environmentSource: SymphonyRuntimeEnvironmentSource;
  runtime: SymphonyRuntimeEnvironmentContext;
  services?: Record<string, SymphonyResolvedRuntimeService>;
  manifestPath?: string | null;
};

export type SymphonyLoadedRuntimeManifest = {
  repoRoot: string;
  manifestPath: string;
  manifest: SymphonyNormalizedRuntimeManifest;
};

export function defaultSymphonyRuntimeManifestPath(
  repoRoot = process.cwd()
): string {
  return path.join(repoRoot, defaultSymphonyRuntimeManifestRelativePath);
}
