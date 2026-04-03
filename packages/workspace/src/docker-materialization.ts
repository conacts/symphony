import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { isEnoent } from "./internal/errors.js";
import {
  dockerEnvFlags,
  dockerCommandError,
  dockerLabelFlags
} from "./docker-client.js";
import {
  buildManagedVolumeLabels,
  type DockerWorkspaceCommandRunner,
  type DockerWorkspaceDescriptor,
  workspaceDescriptorVolumeName
} from "./docker-shared.js";
import { inspectDockerVolume, removeDockerVolume, assertManagedVolume } from "./docker-inspect.js";
import { workspaceExists } from "./workspace-paths.js";
import { SymphonyWorkspaceError } from "./workspace-identity.js";

const execFileAsync = promisify(execFile);

export async function ensureMaterializedWorkspace(input: {
  descriptor: DockerWorkspaceDescriptor;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<boolean> {
  if (input.descriptor.materialization.kind === "bind_mount") {
    return await ensureBindMountedWorkspace(input.descriptor.materialization.hostPath);
  }

  return await ensureManagedVolume({
    descriptor: input.descriptor,
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });
}

export async function removeMaterializedWorkspace(input: {
  descriptor: DockerWorkspaceDescriptor;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<"removed" | "missing"> {
  if (input.descriptor.materialization.kind === "bind_mount") {
    return await removeBindMountedWorkspace(input.descriptor.materialization.hostPath);
  }

  return await removeDockerVolume(
    input.commandRunner,
    input.descriptor.materialization.volumeName,
    input.descriptor,
    input.timeoutMs
  );
}

export async function hydrateBindMountedWorkspaceFromSourceRepo(input: {
  sourceRepoPath: string;
  workspaceHostPath: string;
  workspacePath: string;
  containerName: string;
  shell: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
  githubToken?: string | null;
}): Promise<boolean> {
  const sourceRepoPath = path.resolve(input.sourceRepoPath);
  const workspaceHostPath = path.resolve(input.workspaceHostPath);

  if (sourceRepoPath === workspaceHostPath) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_hydrate_invalid_source",
      `Workspace source repo path must differ from the workspace path: ${workspaceHostPath}.`
    );
  }

  if (await workspaceHasClonedRepository(workspaceHostPath)) {
    return false;
  }

  await assertWorkspaceDirectoryEmpty(workspaceHostPath);
  const cloneSpec = await resolveSourceRepoCloneSpec(sourceRepoPath);
  const cloneEnv: Record<string, string> = {
    SYMPHONY_SOURCE_REPO_URL: cloneSpec.url,
    SYMPHONY_SOURCE_REPO_REF: cloneSpec.ref
  };

  if (typeof input.githubToken === "string" && input.githubToken.trim() !== "") {
    cloneEnv.GITHUB_TOKEN = input.githubToken.trim();
  }

  const args = [
    "exec",
    ...dockerEnvFlags(cloneEnv),
    "--workdir",
    input.workspacePath,
    input.containerName,
    input.shell,
    "-lc",
    buildCloneWorkspaceCommand()
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_clone_failed",
      [
        "Docker workspace clone failed.",
        `Command: docker ${args.slice(0, -1).join(" ")} <clone-script>`,
        result.stdout.trim(),
        result.stderr.trim()
      ]
        .filter((line) => line !== "")
        .join("\n")
    );
  }

  return true;
}

async function ensureBindMountedWorkspace(
  workspacePath: string
): Promise<boolean> {
  try {
    const existing = await stat(workspacePath);
    if (existing.isDirectory()) {
      return false;
    }

    await rm(workspacePath, {
      recursive: true,
      force: true
    });
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
  }

  await mkdir(workspacePath, {
    recursive: true
  });

  return true;
}

async function workspaceHasClonedRepository(
  workspacePath: string
): Promise<boolean> {
  try {
    const existing = await stat(path.join(workspacePath, ".git"));
    return existing.isDirectory() || existing.isFile();
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }

    return false;
  }
}

async function assertWorkspaceDirectoryEmpty(workspacePath: string): Promise<void> {
  const entries = await readdir(workspacePath);
  if (entries.length === 0) {
    return;
  }

  throw new SymphonyWorkspaceError(
    "workspace_docker_clone_target_not_empty",
    `Docker workspace path must be empty before cloning: ${workspacePath}.`
  );
}

async function resolveSourceRepoCloneSpec(sourceRepoPath: string): Promise<{
  url: string;
  ref: string;
}> {
  const url = normalizeGitCloneUrl(
    await runGitCommand(sourceRepoPath, ["remote", "get-url", "origin"])
  );
  const remoteHead =
    (await tryGitCommand(sourceRepoPath, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "refs/remotes/origin/HEAD"
    ])) ?? "origin/main";
  const ref = remoteHead.startsWith("origin/")
    ? remoteHead.slice("origin/".length)
    : remoteHead;

  if (url === "") {
    throw new SymphonyWorkspaceError(
      "workspace_docker_clone_missing_origin",
      `Source repo ${sourceRepoPath} does not define a usable origin remote.`
    );
  }

  if (ref === "") {
    throw new SymphonyWorkspaceError(
      "workspace_docker_clone_missing_ref",
      `Source repo ${sourceRepoPath} does not define a usable remote default branch.`
    );
  }

  return {
    url,
    ref
  };
}

function normalizeGitCloneUrl(url: string): string {
  const trimmed = url.trim();

  const githubScpMatch = /^git@github\.com:(.+)$/.exec(trimmed);
  if (githubScpMatch) {
    return `https://github.com/${githubScpMatch[1]}`;
  }

  const githubSshMatch = /^ssh:\/\/git@github\.com\/(.+)$/.exec(trimmed);
  if (githubSshMatch) {
    return `https://github.com/${githubSshMatch[1]}`;
  }

  return trimmed;
}

async function runGitCommand(
  cwd: string,
  args: string[]
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8"
  });

  return stdout.trim();
}

async function tryGitCommand(
  cwd: string,
  args: string[]
): Promise<string | null> {
  try {
    return await runGitCommand(cwd, args);
  } catch {
    return null;
  }
}

function buildCloneWorkspaceCommand(): string {
  return [
    "set -euo pipefail",
    'repo_url="$SYMPHONY_SOURCE_REPO_URL"',
    'repo_ref="$SYMPHONY_SOURCE_REPO_REF"',
    'if [ -n "$(find . -mindepth 1 -maxdepth 1 -print -quit)" ]; then',
    '  echo "Workspace path must be empty before clone." >&2',
    "  exit 1",
    "fi",
    'if [ -n "${GITHUB_TOKEN:-}" ] && [[ "$repo_url" == https://github.com/* ]]; then',
    '  auth_header="$(python3 - <<\'PY\'',
    "import base64, os",
    'print("AUTHORIZATION: basic " + base64.b64encode(f"x-access-token:{os.environ[\'GITHUB_TOKEN\']}".encode()).decode())',
    'PY',
    ')"',
    '  git -c http.extraheader="$auth_header" clone --branch "$repo_ref" --single-branch "$repo_url" .',
    "else",
    '  git clone --branch "$repo_ref" --single-branch "$repo_url" .',
    "fi"
  ].join("\n");
}

async function removeBindMountedWorkspace(
  workspacePath: string
): Promise<"removed" | "missing"> {
  const existedBeforeDelete = await workspaceExists(workspacePath);

  await rm(workspacePath, {
    recursive: true,
    force: true
  });

  const existsAfterDelete = await workspaceExists(workspacePath);
  if (existsAfterDelete) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_remove_failed",
      `Docker workspace cleanup did not remove ${workspacePath}.`
    );
  }

  return existedBeforeDelete ? "removed" : "missing";
}

async function ensureManagedVolume(input: {
  descriptor: DockerWorkspaceDescriptor;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<boolean> {
  const volumeName = workspaceDescriptorVolumeName(input.descriptor);
  if (!volumeName) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_volume_name",
      `Workspace ${input.descriptor.workspaceKey} does not define a managed volume name.`
    );
  }

  const existing = await inspectDockerVolume(
    input.commandRunner,
    volumeName,
    input.timeoutMs
  );

  if (existing) {
    assertManagedVolume(existing, input.descriptor);
    return false;
  }

  const labels = buildManagedVolumeLabels(input.descriptor);
  const args = [
    "volume",
    "create",
    ...dockerLabelFlags(labels),
    volumeName
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    throw dockerCommandError("volume create", args, result);
  }

  return true;
}
