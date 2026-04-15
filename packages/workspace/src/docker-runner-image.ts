import {
  defaultDockerWorkspaceCommandRunner,
  dockerCommandError,
  dockerLabelFlags,
  isDockerMissingObject
} from "./docker-client.js";
import type {
  DockerWorkspaceCommandResult,
  DockerWorkspaceCommandRunner
} from "./docker-shared.js";
import {
  managedBackendLabelKey,
  managedBackendLabelValue,
  managedKindLabelKey,
  managedWorkspacePreflightKind
} from "./docker-shared.js";
import { SymphonyWorkspaceError } from "./workspace-identity.js";

export const defaultSymphonyDockerWorkspaceImage =
  "symphony/workspace-runner:local";
export const symphonyDockerWorkspaceBuildCommand =
  "pnpm docker:workspace-image:build";
export const symphonyDockerWorkspaceRequiredTools = [
  "bash",
  "gh",
  "git",
  "node",
  "corepack",
  "pi",
  "pnpm",
  "python3",
  "psql",
  "rg",
  "symphony-pi-runner"
] as const;
const defaultSymphonyPiSdkRunnerRoot = "/opt/symphony/pi-sdk-runner";
const symphonyDockerWorkspaceRequiredFiles = [
  `${defaultSymphonyPiSdkRunnerRoot}/node_modules/tsx/dist/loader.mjs`,
  `${defaultSymphonyPiSdkRunnerRoot}/src/pi/sdk-runner-entrypoint.ts`
] as const;
// Docker image inspection and in-container tool checks can exceed 15s when the
// host is already running multiple build/test workers. Keep the default budget
// high enough to avoid load-sensitive false negatives during real bootstrap.
export const defaultSymphonyDockerWorkspacePreflightTimeoutMs = 30_000;
export const defaultSymphonyDockerWorkspacePreflightCreatedTtlMs = 60_000;
export const defaultSymphonyDockerWorkspacePreflightRunningTtlMs = 5 * 60_000;

export type SymphonyDockerWorkspaceImageSelectionSource = "default" | "env";

export type SymphonyDockerWorkspacePreflightResult = {
  image: string;
  shell: string;
  serverVersion: string | null;
  imageId: string | null;
  requiredTools: readonly string[];
  cleanup: SymphonyDockerWorkspacePreflightCleanupSummary;
};

export type SymphonyDockerWorkspacePreflightCleanupDisposition =
  | "removed"
  | "missing"
  | "failed";

export type SymphonyDockerWorkspacePreflightCleanupSummary = {
  staleContainersDetected: number;
  staleContainersRemoved: number;
  staleContainersFailedToRemove: number;
  preservedContainers: number;
  createdContainerTtlMs: number;
  runningContainerTtlMs: number;
  sweepFailed: boolean;
  currentContainerCleanupDisposition: SymphonyDockerWorkspacePreflightCleanupDisposition;
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
  staleCreatedTtlMs?: number | null;
  staleRunningTtlMs?: number | null;
}): Promise<SymphonyDockerWorkspacePreflightResult> {
  const image = input.image.trim();
  if (image === "") {
    throw new TypeError("Docker workspace preflight requires a non-empty image.");
  }

  const shell = normalizeNonEmptyString(input.shell) ?? "bash";
  const commandRunner = input.commandRunner ?? defaultDockerWorkspaceCommandRunner;
  const timeoutMs =
    input.timeoutMs ?? defaultSymphonyDockerWorkspacePreflightTimeoutMs;
  const staleCreatedTtlMs = normalizePositiveInteger(
    input.staleCreatedTtlMs
  ) ?? defaultSymphonyDockerWorkspacePreflightCreatedTtlMs;
  const staleRunningTtlMs = normalizePositiveInteger(
    input.staleRunningTtlMs
  ) ?? defaultSymphonyDockerWorkspacePreflightRunningTtlMs;

  const serverVersion = await resolveDockerServerVersion(commandRunner, timeoutMs);
  const imageId = await resolveDockerImageId(commandRunner, image, timeoutMs);
  const cleanupTimeoutMs = resolvePreflightCleanupTimeoutMs(timeoutMs);
  const preflightContainerName = buildDockerWorkspacePreflightContainerName();
  const staleCleanup = await cleanupManagedPreflightContainers({
    commandRunner,
    timeoutMs: cleanupTimeoutMs,
    currentContainerName: preflightContainerName,
    staleCreatedTtlMs,
    staleRunningTtlMs
  });
  let currentContainerCleanupDisposition!: SymphonyDockerWorkspacePreflightCleanupDisposition;

  try {
    await assertDockerImageToolContract({
      commandRunner,
      image,
      shell,
      timeoutMs,
      preflightContainerName
    });
  } finally {
    currentContainerCleanupDisposition = await forceRemovePreflightContainer({
      commandRunner,
      containerName: preflightContainerName,
      timeoutMs: cleanupTimeoutMs
    });
  }

  return {
    image,
    shell,
    serverVersion,
    imageId,
    requiredTools: symphonyDockerWorkspaceRequiredTools,
    cleanup: {
      ...staleCleanup,
      createdContainerTtlMs: staleCreatedTtlMs,
      runningContainerTtlMs: staleRunningTtlMs,
      currentContainerCleanupDisposition
    }
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
  preflightContainerName: string;
}): Promise<void> {
  const args = [
    "run",
    "--rm",
    "--name",
    input.preflightContainerName,
    ...dockerLabelFlags({
      [managedBackendLabelKey]: managedBackendLabelValue,
      [managedKindLabelKey]: managedWorkspacePreflightKind
    }),
    "--entrypoint",
    input.shell,
    input.image,
    "-lc",
    renderRunnerContractCheckScript({
      tools: symphonyDockerWorkspaceRequiredTools,
      files: symphonyDockerWorkspaceRequiredFiles
    })
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode === 0) {
    return;
  }

  const missingEntries = result.stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (missingEntries.length > 0) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_image_invalid",
      [
        `Docker workspace image ${input.image} is missing required runner contract entries: ${missingEntries.join(", ")}.`,
        `Required tools: ${symphonyDockerWorkspaceRequiredTools.join(", ")}.`,
        `Required files: ${symphonyDockerWorkspaceRequiredFiles.join(", ")}.`,
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

function buildDockerWorkspacePreflightContainerName(): string {
  return [
    "symphony-workspace-preflight",
    String(process.pid),
    Date.now().toString(36)
  ].join("-");
}

type ManagedPreflightContainerSummary = {
  name: string;
  state: string | null;
};

type ManagedPreflightContainerInspectState = {
  createdAt: string | null;
  startedAt: string | null;
};

async function cleanupManagedPreflightContainers(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
  currentContainerName: string;
  staleCreatedTtlMs: number;
  staleRunningTtlMs: number;
}): Promise<
  Omit<
    SymphonyDockerWorkspacePreflightCleanupSummary,
    | "createdContainerTtlMs"
    | "runningContainerTtlMs"
    | "currentContainerCleanupDisposition"
  >
> {
  const containers = await listManagedPreflightContainers({
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });

  if (containers === null) {
    return {
      staleContainersDetected: 0,
      staleContainersRemoved: 0,
      staleContainersFailedToRemove: 0,
      preservedContainers: 0,
      sweepFailed: true
    };
  }

  let staleContainersDetected = 0;
  let staleContainersRemoved = 0;
  let staleContainersFailedToRemove = 0;
  let preservedContainers = 0;

  for (const container of containers) {
    if (container.name === input.currentContainerName) {
      continue;
    }

    const shouldRemove = await shouldRemoveManagedPreflightContainer({
      commandRunner: input.commandRunner,
      timeoutMs: input.timeoutMs,
      container,
      staleCreatedTtlMs: input.staleCreatedTtlMs,
      staleRunningTtlMs: input.staleRunningTtlMs
    });

    if (!shouldRemove) {
      preservedContainers += 1;
      continue;
    }

    staleContainersDetected += 1;
    const disposition = await forceRemovePreflightContainer({
      commandRunner: input.commandRunner,
      containerName: container.name,
      timeoutMs: input.timeoutMs
    });

    if (disposition === "removed" || disposition === "missing") {
      staleContainersRemoved += 1;
      continue;
    }

    staleContainersFailedToRemove += 1;
  }

  return {
    staleContainersDetected,
    staleContainersRemoved,
    staleContainersFailedToRemove,
    preservedContainers,
    sweepFailed: false
  };
}

async function listManagedPreflightContainers(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<ManagedPreflightContainerSummary[] | null> {
  const args = [
    "ps",
    "-a",
    "--filter",
    `label=${managedBackendLabelKey}=${managedBackendLabelValue}`,
    "--filter",
    `label=${managedKindLabelKey}=${managedWorkspacePreflightKind}`,
    "--format",
    "{{json .}}"
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    return null;
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as {
          Names?: unknown;
          State?: unknown;
        };
        const name = normalizeNonEmptyString(
          typeof parsed.Names === "string" ? parsed.Names : null
        );
        if (!name) {
          return [];
        }

        return [
          {
            name,
            state:
              typeof parsed.State === "string"
                ? parsed.State.trim().toLowerCase()
                : null
          } satisfies ManagedPreflightContainerSummary
        ];
      } catch {
        return [];
      }
    });
}

async function shouldRemoveManagedPreflightContainer(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
  container: ManagedPreflightContainerSummary;
  staleCreatedTtlMs: number;
  staleRunningTtlMs: number;
}): Promise<boolean> {
  const state = input.container.state;
  if (state === "exited" || state === "dead" || state === "removing") {
    return true;
  }

  if (state !== "created" && state !== "running") {
    return false;
  }

  const inspectState = await inspectManagedPreflightContainer({
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs,
    containerName: input.container.name
  });

  if (inspectState === "missing") {
    return true;
  }

  if (inspectState === "failed") {
    return false;
  }

  const referenceTimestamp =
    state === "running" ? inspectState.startedAt : inspectState.createdAt;
  const thresholdMs =
    state === "running" ? input.staleRunningTtlMs : input.staleCreatedTtlMs;
  if (!referenceTimestamp) {
    return false;
  }

  const ageMs = Date.now() - Date.parse(referenceTimestamp);
  if (!Number.isFinite(ageMs)) {
    return false;
  }

  return ageMs >= thresholdMs;
}

async function inspectManagedPreflightContainer(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
  containerName: string;
}): Promise<ManagedPreflightContainerInspectState | "missing" | "failed"> {
  const args = ["inspect", "--type", "container", input.containerName];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    return isDockerMissingObject(result.stderr) ? "missing" : "failed";
  }

  try {
    const parsed = JSON.parse(result.stdout) as Array<{
      Created?: unknown;
      State?: {
        Status?: unknown;
        StartedAt?: unknown;
      };
    }>;
    const container = parsed[0];
    if (!container) {
      return "failed";
    }

    return {
      createdAt:
        typeof container.Created === "string" ? container.Created : null,
      startedAt:
        typeof container.State?.StartedAt === "string"
          ? container.State.StartedAt
          : null
    };
  } catch {
    return "failed";
  }
}

async function forceRemovePreflightContainer(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  containerName: string;
  timeoutMs: number;
}): Promise<SymphonyDockerWorkspacePreflightCleanupDisposition> {
  const args = ["rm", "-f", input.containerName];

  try {
    const result = await input.commandRunner({
      args,
      timeoutMs: input.timeoutMs
    });

    if (result.exitCode === 0) {
      return "removed";
    }

    return isDockerMissingObject(result.stderr) ? "missing" : "failed";
  } catch {
    return "failed";
  }
}

function resolvePreflightCleanupTimeoutMs(timeoutMs: number): number {
  return Math.max(5_000, Math.min(timeoutMs, 15_000));
}

function renderRunnerContractCheckScript(input: {
  tools: readonly string[];
  files: readonly string[];
}): string {
  return [
    "missing=0",
    ...input.tools.map(
      (tool) =>
        `if ! command -v ${escapeShellWord(tool)} >/dev/null 2>&1; then echo ${escapeShellWord(`tool:${tool}`)}; missing=1; fi`
    ),
    ...input.files.map(
      (filePath) =>
        `if [ ! -f ${escapeShellWord(filePath)} ]; then echo ${escapeShellWord(`file:${filePath}`)}; missing=1; fi`
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

function normalizePositiveInteger(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}
