import fs from "node:fs";
import path from "node:path";

const defaultDockerGitHubConfigPath = "/home/agent/.config/gh";
const defaultDockerPiAuthPath = "/home/agent/.pi/agent/auth.json";

type DockerReadOnlyMount = {
  sourcePath: string;
  containerPath: string;
  readOnly: true;
};

export type DockerGitHubCliAuthContract = {
  mount: DockerReadOnlyMount | null;
  configDirectoryPath: string | null;
  launchEnv: Record<string, string>;
  authEnvKey: "GH_TOKEN" | "GITHUB_TOKEN" | null;
};

export type DockerPiAuthContract = {
  mount: DockerReadOnlyMount | null;
  launchEnv: Record<string, string>;
  authFilePath: string | null;
  providerEnvKey: string | null;
};

export type DockerWorkspaceAuthContracts = {
  githubCli: DockerGitHubCliAuthContract;
  pi: DockerPiAuthContract;
  mounts: DockerReadOnlyMount[];
};

export function resolveDockerGitHubCliAuthContract(
  hostCommandEnvSource: Record<string, string | undefined>
): DockerGitHubCliAuthContract {
  const tokenEnv = resolveGitHubCliLaunchEnv(hostCommandEnvSource);
  if (tokenEnv) {
    return {
      mount: null,
      configDirectoryPath: null,
      launchEnv: tokenEnv,
      authEnvKey: Object.keys(tokenEnv)[0] as "GH_TOKEN" | "GITHUB_TOKEN"
    };
  }

  const configDirectoryPath = resolveGitHubCliConfigDirectoryPath(hostCommandEnvSource);
  return {
    mount: createReadOnlyMount(configDirectoryPath, defaultDockerGitHubConfigPath),
    configDirectoryPath,
    launchEnv: {},
    authEnvKey: null
  };
}

export function resolveDockerPiAuthContract(
  hostCommandEnvSource: Record<string, string | undefined>,
  options: {
    preferredApiKeyEnvKey?: string | null;
  } = {}
): DockerPiAuthContract {
  const authFilePath = resolvePiAuthFilePath(hostCommandEnvSource);
  const providerEnvKey = normalizePreferredApiKeyEnvKey(options.preferredApiKeyEnvKey);

  return {
    mount: createReadOnlyMount(authFilePath, defaultDockerPiAuthPath),
    launchEnv:
      providerEnvKey === null
        ? {}
        : resolveLaunchEnv(hostCommandEnvSource, providerEnvKey),
    authFilePath,
    providerEnvKey
  };
}

export function resolveDockerWorkspaceAuthContracts(
  hostCommandEnvSource: Record<string, string | undefined>,
  options: {
    preferredApiKeyEnvKey?: string | null;
  } = {}
): DockerWorkspaceAuthContracts {
  const githubCli = resolveDockerGitHubCliAuthContract(hostCommandEnvSource);
  const pi = resolveDockerPiAuthContract(hostCommandEnvSource, options);

  return {
    githubCli,
    pi,
    mounts: [githubCli.mount, pi.mount].filter(
      (mount): mount is DockerReadOnlyMount => mount !== null
    )
  };
}

function resolveGitHubCliLaunchEnv(
  hostCommandEnvSource: Record<string, string | undefined>
): Record<string, string> | null {
  const ghToken = normalizeNonEmptyString(hostCommandEnvSource.GH_TOKEN);
  if (ghToken) {
    return {
      GH_TOKEN: ghToken
    };
  }

  const githubToken = normalizeNonEmptyString(hostCommandEnvSource.GITHUB_TOKEN);
  if (githubToken) {
    return {
      GITHUB_TOKEN: githubToken
    };
  }

  return null;
}

function resolveLaunchEnv(
  hostCommandEnvSource: Record<string, string | undefined>,
  providerEnvKey: string
): Record<string, string> {
  const apiKey = hostCommandEnvSource[providerEnvKey];

  return typeof apiKey === "string" && apiKey.trim() !== ""
    ? {
        [providerEnvKey]: apiKey
      }
    : {};
}

function normalizePreferredApiKeyEnvKey(
  preferredApiKeyEnvKey: string | null | undefined
): string | null {
  return normalizeNonEmptyString(preferredApiKeyEnvKey) ?? null;
}

function resolveGitHubCliConfigDirectoryPath(
  hostCommandEnvSource: Record<string, string | undefined>
): string | null {
  const explicitConfigHome = normalizeNonEmptyString(hostCommandEnvSource.XDG_CONFIG_HOME);

  if (explicitConfigHome) {
    const ghConfigPath = path.join(explicitConfigHome, "gh");
    if (fs.existsSync(ghConfigPath)) {
      return ghConfigPath;
    }
  }

  const home = normalizeNonEmptyString(hostCommandEnvSource.HOME);
  if (!home) {
    return null;
  }

  const ghConfigPath = path.join(home, ".config", "gh");
  return fs.existsSync(ghConfigPath) ? ghConfigPath : null;
}

function resolvePiAuthFilePath(
  hostCommandEnvSource: Record<string, string | undefined>
): string | null {
  const home = normalizeNonEmptyString(hostCommandEnvSource.HOME);
  if (!home) {
    return null;
  }

  const authPath = path.join(home, ".pi", "agent", "auth.json");
  return fs.existsSync(authPath) ? authPath : null;
}

function normalizeNonEmptyString(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function createReadOnlyMount(
  sourcePath: string | null,
  containerPath: string
): DockerReadOnlyMount | null {
  if (!sourcePath) {
    return null;
  }

  return {
    sourcePath,
    containerPath,
    readOnly: true
  };
}
