import fs from "node:fs";

const defaultDockerCodexAuthPath = "/tmp/symphony-home/.codex/auth.json";

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
      mode: "openai_api_key";
      mount: null;
      launchEnv: Record<string, string>;
      authFilePath: null;
    }
  | {
      mode: "unavailable";
      mount: null;
      launchEnv: Record<string, string>;
      authFilePath: null;
    };

export function resolveDockerCodexAuthContract(
  hostCommandEnvSource: Record<string, string | undefined>
): DockerCodexAuthContract {
  const authFilePath = resolveCodexAuthFilePath(hostCommandEnvSource);

  if (authFilePath) {
    return {
      mode: "auth_json",
      mount: {
        sourcePath: authFilePath,
        containerPath: defaultDockerCodexAuthPath,
        readOnly: true
      },
      launchEnv: {},
      authFilePath
    };
  }

  const openAiApiKey = hostCommandEnvSource.OPENAI_API_KEY;
  if (typeof openAiApiKey === "string" && openAiApiKey.trim() !== "") {
    return {
      mode: "openai_api_key",
      mount: null,
      launchEnv: {
        OPENAI_API_KEY: openAiApiKey
      },
      authFilePath: null
    };
  }

  return {
    mode: "unavailable",
    mount: null,
    launchEnv: {},
    authFilePath: null
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

function normalizeNonEmptyString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
