import {
  defaultDockerWorkspaceCommandRunner,
  dockerCommandError,
  isDockerMissingObject
} from "./docker-client.js";
import type {
  DockerWorkspaceCommandResult,
  DockerWorkspaceCommandRunner
} from "./docker-shared.js";
import { SymphonyWorkspaceError } from "./workspace-identity.js";

export const defaultSymphonyDockerWorkspaceImage =
  "symphony/workspace-runner:local";
export const symphonyDockerWorkspaceBuildCommand =
  "pnpm docker:workspace-image:build";
export const symphonyDockerWorkspaceRequiredTools = [
  "bash",
  "codex",
  "gh",
  "git",
  "node",
  "corepack",
  "pnpm",
  "python3",
  "psql",
  "rg"
] as const;
export const defaultSymphonyDockerWorkspacePreflightTimeoutMs = 15_000;

export type SymphonyDockerWorkspaceImageSelectionSource = "default" | "env";

export type SymphonyDockerWorkspacePreflightResult = {
  image: string;
  shell: string;
  serverVersion: string | null;
  imageId: string | null;
  requiredTools: readonly string[];
};

export function resolveSymphonyDockerWorkspaceImage(image: string | null): {
  image: string;
  imageSelectionSource: SymphonyDockerWorkspaceImageSelectionSource;
} {
  if (typeof image === "string" && image.trim() !== "") {
    return {
      image: image.trim(),
      imageSelectionSource: "env"
    };
  }

  return {
    image: defaultSymphonyDockerWorkspaceImage,
    imageSelectionSource: "default"
  };
}

export async function preflightSymphonyDockerWorkspaceImage(input: {
  image: string;
  shell?: string | null;
  commandRunner?: DockerWorkspaceCommandRunner;
  timeoutMs?: number | null;
}): Promise<SymphonyDockerWorkspacePreflightResult> {
  const image = input.image.trim();
  if (image === "") {
    throw new TypeError("Docker workspace preflight requires a non-empty image.");
  }

  const shell = normalizeNonEmptyString(input.shell) ?? "bash";
  const commandRunner = input.commandRunner ?? defaultDockerWorkspaceCommandRunner;
  const timeoutMs =
    input.timeoutMs ?? defaultSymphonyDockerWorkspacePreflightTimeoutMs;

  const serverVersion = await resolveDockerServerVersion(commandRunner, timeoutMs);
  const imageId = await resolveDockerImageId(commandRunner, image, timeoutMs);
  await assertDockerImageToolContract({
    commandRunner,
    image,
    shell,
    timeoutMs
  });

  return {
    image,
    shell,
    serverVersion,
    imageId,
    requiredTools: symphonyDockerWorkspaceRequiredTools
  };
}

async function resolveDockerServerVersion(
  commandRunner: DockerWorkspaceCommandRunner,
  timeoutMs: number
): Promise<string | null> {
  const args = ["version", "--format", "{{.Server.Version}}"];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_unavailable",
      [
        "Symphony Docker workspaces require a reachable Docker CLI and daemon.",
        "Install Docker Desktop or start a compatible Docker daemon, then retry.",
        summarizeDockerResult(result)
      ]
        .filter((line) => line !== "")
        .join("\n")
    );
  }

  const serverVersion = normalizeNonEmptyString(result.stdout);
  return serverVersion ?? null;
}

async function resolveDockerImageId(
  commandRunner: DockerWorkspaceCommandRunner,
  image: string,
  timeoutMs: number
): Promise<string | null> {
  const args = ["image", "inspect", "--format", "{{.Id}}", image];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0) {
    if (isDockerMissingObject(result.stderr)) {
      throw new SymphonyWorkspaceError(
        "workspace_docker_image_missing",
        [
          `Docker workspace image ${image} is not available locally.`,
          image === defaultSymphonyDockerWorkspaceImage
            ? `Build the supported local runner image with \`${symphonyDockerWorkspaceBuildCommand}\`.`
            : `Build or pull ${image}, or unset SYMPHONY_DOCKER_WORKSPACE_IMAGE to use ${defaultSymphonyDockerWorkspaceImage}.`,
          `Required tools: ${symphonyDockerWorkspaceRequiredTools.join(", ")}.`
        ].join("\n")
      );
    }

    throw dockerCommandError("image inspect", args, result);
  }

  return normalizeNonEmptyString(result.stdout) ?? null;
}

async function assertDockerImageToolContract(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  image: string;
  shell: string;
  timeoutMs: number;
}): Promise<void> {
  const args = [
    "run",
    "--rm",
    "--entrypoint",
    input.shell,
    input.image,
    "-lc",
    renderRequiredToolsCheckScript(symphonyDockerWorkspaceRequiredTools)
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode === 0) {
    return;
  }

  const missingTools = result.stdout
    .split("\n")
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0);

  if (missingTools.length > 0) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_image_invalid",
      [
        `Docker workspace image ${input.image} is missing required tools: ${missingTools.join(", ")}.`,
        `Supported runner contract: ${symphonyDockerWorkspaceRequiredTools.join(", ")}.`,
        input.image === defaultSymphonyDockerWorkspaceImage
          ? `Rebuild the supported local runner image with \`${symphonyDockerWorkspaceBuildCommand}\`.`
          : `Build a compatible image or unset SYMPHONY_DOCKER_WORKSPACE_IMAGE to use ${defaultSymphonyDockerWorkspaceImage}.`
      ].join("\n")
    );
  }

  if (dockerShellMissing(result, input.shell)) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_image_invalid",
      [
        `Docker workspace image ${input.image} does not provide the configured shell ${input.shell}.`,
        "Set SYMPHONY_DOCKER_SHELL to a shell that exists in the image or rebuild the image with the expected shell installed.",
        summarizeDockerResult(result)
      ]
        .filter((line) => line !== "")
        .join("\n")
    );
  }

  throw dockerCommandError("run", args, result);
}

function renderRequiredToolsCheckScript(tools: readonly string[]): string {
  return [
    "missing=0",
    ...tools.map(
      (tool) =>
        `if ! command -v ${escapeShellWord(tool)} >/dev/null 2>&1; then echo ${escapeShellWord(tool)}; missing=1; fi`
    ),
    "exit \"$missing\""
  ].join("; ");
}

function escapeShellWord(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function dockerShellMissing(
  result: DockerWorkspaceCommandResult,
  shell: string
): boolean {
  const stderr = result.stderr;

  return (
    stderr.includes(`exec: "${shell}"`) &&
    /executable file not found|no such file or directory/i.test(stderr)
  );
}

function summarizeDockerResult(result: DockerWorkspaceCommandResult): string {
  return [result.stdout.trim(), result.stderr.trim()]
    .filter((line) => line !== "")
    .join("\n");
}

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
