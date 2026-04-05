import fs from "node:fs";
import path from "node:path";

const defaultDockerCodexAuthPath =
  "/home/agent/auth.json";
const defaultDockerCodexHomePath = "/home/agent";
const defaultDockerGitHubConfigPath = "/home/agent/.config/gh";
const defaultDockerOpenCodeAuthPath =
  "/home/agent/.local/share/opencode/auth.json";
const defaultDockerPiAuthPath =
  "/home/agent/.pi/agent/auth.json";

type DockerReadOnlyMount = {
  sourcePath: string;
  containerPath: string;
  readOnly: true;
};

export type DockerCodexAuthContract =
  | {
      mode: "auth_json";
      mount: DockerReadOnlyMount;
      launchEnv: Record<string, string>;
      authFilePath: string;
    }
  | {
      mode: "api_key_env";
      mount: null;
      launchEnv: Record<string, string>;
      apiKeyEnvKey: string;
      authFilePath: null;
    }
  | {
      mode: "unavailable";
      mount: null;
      launchEnv: Record<string, string>;
    authFilePath: null;
    };

export type DockerGitHubCliAuthContract = {
  mount: DockerReadOnlyMount | null;
  configDirectoryPath: string | null;
};

export type DockerOpenCodeAuthContract = {
  mount: DockerReadOnlyMount | null;
  authFilePath: string | null;
};

export type DockerPiAuthContract = {
  mount: DockerReadOnlyMount | null;
  launchEnv: Record<string, string>;
  authFilePath: string | null;
};

export type DockerWorkspaceAuthContracts = {
  codex: DockerCodexAuthContract;
  githubCli: DockerGitHubCliAuthContract;
  opencode: DockerOpenCodeAuthContract;
  pi: DockerPiAuthContract;
  mounts: DockerReadOnlyMount[];
};

export function resolveDockerCodexAuthContract(
  hostCommandEnvSource: Record<string, string | undefined>,
  options: {
    preferredApiKeyEnvKey?: string | null;
  } = {}
): DockerCodexAuthContract {
  const preferredProviderLaunchEnv = resolvePreferredApiKeyLaunchEnv(
    hostCommandEnvSource,
    options.preferredApiKeyEnvKey
  );
  const authFilePath = resolveCodexAuthFilePath(hostCommandEnvSource);

  if (authFilePath) {
    return {
      mode: "auth_json",
      mount: {
        sourcePath: authFilePath,
        containerPath: defaultDockerCodexAuthPath,
        readOnly: true
      },
      launchEnv: {
        CODEX_HOME: defaultDockerCodexHomePath,
        ...preferredProviderLaunchEnv
      },
      authFilePath
    };
  }

  const preferredApiKeyEnvKeys = resolvePreferredApiKeyEnvKeys(
    options.preferredApiKeyEnvKey
  );

  for (const envKey of preferredApiKeyEnvKeys) {
    const apiKey = hostCommandEnvSource[envKey];
    if (typeof apiKey === "string" && apiKey.trim() !== "") {
      return {
        mode: "api_key_env",
        mount: null,
        launchEnv: {
          [envKey]: apiKey
        },
        apiKeyEnvKey: envKey,
        authFilePath: null
      };
    }
  }

  return {
    mode: "unavailable",
    mount: null,
    launchEnv: {},
    authFilePath: null
  };
}

function resolvePreferredApiKeyLaunchEnv(
  hostCommandEnvSource: Record<string, string | undefined>,
  preferredApiKeyEnvKey: string | null | undefined
): Record<string, string> {
  for (const envKey of resolvePreferredApiKeyEnvKeys(preferredApiKeyEnvKey)) {
    const apiKey = hostCommandEnvSource[envKey];
    if (typeof apiKey === "string" && apiKey.trim() !== "") {
      return {
        [envKey]: apiKey
      };
    }
  }

  return {};
}

function resolvePreferredApiKeyEnvKeys(
  preferredApiKeyEnvKey: string | null | undefined
): string[] {
  return [preferredApiKeyEnvKey, "OPENAI_API_KEY"].filter(
    (value, index, values): value is string =>
      typeof value === "string" && value.trim() !== "" && values.indexOf(value) === index
  );
}

export function resolveDockerGitHubCliAuthContract(
  hostCommandEnvSource: Record<string, string | undefined>
): DockerGitHubCliAuthContract {
  const configDirectoryPath = resolveGitHubCliConfigDirectoryPath(hostCommandEnvSource);
  return {
    mount: createReadOnlyMount(configDirectoryPath, defaultDockerGitHubConfigPath),
    configDirectoryPath
  };
}

export function resolveDockerOpenCodeAuthContract(
  hostCommandEnvSource: Record<string, string | undefined>
): DockerOpenCodeAuthContract {
  const authFilePath = resolveOpenCodeAuthFilePath(hostCommandEnvSource);
  return {
    mount: createReadOnlyMount(authFilePath, defaultDockerOpenCodeAuthPath),
    authFilePath
  };
}

export function resolveDockerPiAuthContract(
  hostCommandEnvSource: Record<string, string | undefined>,
  options: {
    preferredApiKeyEnvKey?: string | null;
  } = {}
): DockerPiAuthContract {
  const authFilePath = resolvePiAuthFilePath(hostCommandEnvSource);
  const launchEnv = resolvePreferredApiKeyLaunchEnv(
    hostCommandEnvSource,
    options.preferredApiKeyEnvKey
  );

  return {
    mount: createReadOnlyMount(authFilePath, defaultDockerPiAuthPath),
    launchEnv,
    authFilePath
  };
}

export function resolveDockerWorkspaceAuthContracts(
  hostCommandEnvSource: Record<string, string | undefined>,
  options: {
    preferredApiKeyEnvKey?: string | null;
  } = {}
): DockerWorkspaceAuthContracts {
  const codex = resolveDockerCodexAuthContract(hostCommandEnvSource, options);
  const githubCli = resolveDockerGitHubCliAuthContract(hostCommandEnvSource);
  const opencode = resolveDockerOpenCodeAuthContract(hostCommandEnvSource);
  const pi = resolveDockerPiAuthContract(hostCommandEnvSource, options);

  return {
    codex,
    githubCli,
    opencode,
    pi,
    mounts: [codex.mount, githubCli.mount, opencode.mount, pi.mount].filter(
      (mount): mount is DockerReadOnlyMount => mount !== null
    )
  };
}

function resolveCodexAuthFilePath(
  hostCommandEnvSource: Record<string, string | undefined>
): string | null {
  const codexHome = normalizeNonEmptyString(hostCommandEnvSource.CODEX_HOME);
  if (codexHome) {
    const authPath = `${codexHome}/auth.json`;
    if (fs.existsSync(authPath)) {
      return authPath;
    }
  }

  const home = normalizeNonEmptyString(hostCommandEnvSource.HOME);
  if (!home) {
    return null;
  }

  const authPath = `${home}/.codex/auth.json`;
  return fs.existsSync(authPath) ? authPath : null;
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

function resolveOpenCodeAuthFilePath(
  hostCommandEnvSource: Record<string, string | undefined>
): string | null {
  const explicitDataHome = normalizeNonEmptyString(
    hostCommandEnvSource.XDG_DATA_HOME
  );

  if (explicitDataHome) {
    const authPath = path.join(explicitDataHome, "opencode", "auth.json");
    if (fs.existsSync(authPath)) {
      return authPath;
    }
  }

  const home = normalizeNonEmptyString(hostCommandEnvSource.HOME);
  if (!home) {
    return null;
  }

  const authPath = path.join(home, ".local", "share", "opencode", "auth.json");
  return fs.existsSync(authPath) ? authPath : null;
}

function resolvePiAuthFilePath(
  hostCommandEnvSource: Record<string, string | undefined>
): string | null {
  const explicitAgentDir = normalizeNonEmptyString(
    hostCommandEnvSource.PI_AGENT_DIR
  );
  if (explicitAgentDir) {
    const authPath = path.join(explicitAgentDir, "auth.json");
    if (fs.existsSync(authPath)) {
      return authPath;
    }
  }

  const home = normalizeNonEmptyString(hostCommandEnvSource.HOME);
  if (!home) {
    return null;
  }

  const authPath = path.join(home, ".pi", "agent", "auth.json");
  return fs.existsSync(authPath) ? authPath : null;
}

function normalizeNonEmptyString(value: string | undefined): string | null {
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
