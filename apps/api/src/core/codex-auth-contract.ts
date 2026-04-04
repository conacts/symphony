import fs from "node:fs";
import path from "node:path";

const defaultDockerCodexAuthPath =
  "/home/agent/auth.json";
const defaultDockerCodexHomePath = "/home/agent";
const defaultDockerGitHubConfigPath = "/home/agent/.config/gh";

export type DockerCodexAuthContract =
  | {
      mode: "auth_json";
      mount: {
        sourcePath: string;
        containerPath: string;
        readOnly: true;
      };
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
  mount: {
    sourcePath: string;
    containerPath: string;
    readOnly: true;
  } | null;
  configDirectoryPath: string | null;
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

  if (!configDirectoryPath) {
    return {
      mount: null,
      configDirectoryPath: null
    };
  }

  return {
    mount: {
      sourcePath: configDirectoryPath,
      containerPath: defaultDockerGitHubConfigPath,
      readOnly: true
    },
    configDirectoryPath
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

function normalizeNonEmptyString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
