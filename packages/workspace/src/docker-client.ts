import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import {
  DockerClient,
  NotFoundError,
  type ContainerCreateRequest,
  type ExecConfig,
  type ExecStartConfig,
  type Mount,
  type VolumeCreateOptions
} from "@docker/node-sdk";
import { SymphonyWorkspaceError } from "./workspace-identity.js";
import type { DockerWorkspaceCommandResult } from "./docker-shared.js";

type DockerClientLike = Pick<
  DockerClient,
  | "close"
  | "systemVersion"
  | "imageInspect"
  | "containerInspect"
  | "containerDelete"
  | "containerStop"
  | "containerStart"
  | "containerCreate"
  | "containerWait"
  | "containerExec"
  | "execStart"
  | "execInspect"
  | "containerLogs"
  | "volumeInspect"
  | "volumeCreate"
  | "volumeDelete"
  | "networkInspect"
  | "networkDelete"
>;

export type DockerClientFactory = () => Promise<DockerClientLike>;

export type DockerCliCommandRunner = (
  input: DockerWorkspaceCommandInput
) => Promise<DockerWorkspaceCommandResult>;

export function createDockerWorkspaceCommandRunner(input?: {
  clientFactory?: DockerClientFactory;
  cliRunner?: DockerCliCommandRunner;
}): DockerWorkspaceCommandRunner {
  const clientFactory =
    input?.clientFactory ?? (async () => await DockerClient.fromDockerConfig());
  const cliRunner = input?.cliRunner ?? runDockerCliCommand;

  return async function runDockerWorkspaceCommand(
    command: DockerWorkspaceCommandInput
  ): Promise<DockerWorkspaceCommandResult> {
    const client = await clientFactory();

    try {
      return await withDockerTimeout(command.timeoutMs, async () => {
        return await runDockerCommand(client, command.args, cliRunner);
      });
    } finally {
      await client.close().catch(() => undefined);
    }
  };
}

export const defaultDockerWorkspaceCommandRunner =
  createDockerWorkspaceCommandRunner();

export type DockerWorkspaceCommandRunner = (
  input: DockerWorkspaceCommandInput
) => Promise<DockerWorkspaceCommandResult>;

export type DockerWorkspaceCommandInput = {
  args: string[];
  timeoutMs: number;
};

export function dockerCommandError(
  operation: string,
  args: string[],
  result: DockerWorkspaceCommandResult
): SymphonyWorkspaceError {
  return new SymphonyWorkspaceError(
    "workspace_docker_command_failed",
    [
      `docker ${operation} failed.`,
      `Command: docker ${sanitizeDockerArgs(args).join(" ")}`,
      result.stdout.trim(),
      result.stderr.trim()
    ]
      .filter((line) => line !== "")
      .join("\n")
  );
}

export function dockerLabelFlags(labels: Record<string, string>): string[] {
  return Object.entries(labels).flatMap(([key, value]) => [
    "--label",
    `${key}=${value}`
  ]);
}

export function dockerEnvFlags(env: Record<string, string>): string[] {
  return Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
}

export function hostUserFlags(): string[] {
  const uid = process.getuid?.();
  const gid = process.getgid?.();

  if (typeof uid !== "number" || typeof gid !== "number") {
    return [];
  }

  return ["--user", `${uid}:${gid}`];
}

export function isDockerMissingObject(stderr: string): boolean {
  return (
    /No such (?:object|container|network|volume|image)/i.test(stderr) ||
    /(?:object|container|network|volume|image) .* not found/i.test(stderr)
  );
}

export function resolveDockerTimeoutMs(
  configuredTimeoutMs: number | null,
  fallbackTimeoutMs: number
): number {
  return configuredTimeoutMs ?? fallbackTimeoutMs;
}

export function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

export function shouldRedactDockerEnvValue(key: string): boolean {
  return /(PASSWORD|TOKEN|SECRET|DATABASE_URL|API_KEY|PRIVATE_KEY)/i.test(key);
}

async function runDockerCommand(
  client: DockerClientLike,
  args: string[],
  cliRunner: DockerCliCommandRunner
): Promise<DockerWorkspaceCommandResult> {
  const command = args[0];
  if (!command) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "docker command requires at least one argument."
    };
  }

  try {
    switch (command) {
      case "version":
        return await runDockerVersionCommand(client);
      case "image":
        return await runDockerImageCommand(client, args);
      case "inspect":
        return await runDockerInspectCommand(client, args);
      case "network":
        return await runDockerNetworkCommand(client, args);
      case "volume":
        return await runDockerVolumeCommand(client, args);
      case "rm":
        return await runDockerContainerDeleteCommand(client, args);
      case "stop":
        return await runDockerContainerStopCommand(client, args);
      case "start":
        return await runDockerContainerStartCommand(client, args);
      case "exec":
        return await runDockerExecCommand(client, args, cliRunner);
      case "run":
        return await runDockerRunCommand(client, args);
      default:
        return unsupportedDockerCommandResult(args);
    }
  } catch (error) {
    return renderDockerErrorResult(args, error);
  }
}

async function runDockerVersionCommand(
  client: DockerClientLike
): Promise<DockerWorkspaceCommandResult> {
  const version = (await client.systemVersion()) as {
    ServerVersion?: string;
    Version?: string;
  };
  return {
    exitCode: 0,
    stdout: `${version.ServerVersion ?? version.Version ?? ""}\n`,
    stderr: ""
  };
}

async function runDockerImageCommand(
  client: DockerClientLike,
  args: string[]
): Promise<DockerWorkspaceCommandResult> {
  const subcommand = args[1];
  if (subcommand !== "inspect") {
    return unsupportedDockerCommandResult(args);
  }

  const imageName = requireCommandArgument(args, args.length - 1, "image name");
  const format = readFormatOption(args, 2);
  let image;
  try {
    image = await client.imageInspect(imageName);
  } catch (error) {
    if (isDockerNotFoundError(error)) {
      return missingDockerObjectResult("image", imageName);
    }

    throw error;
  }

  if (format === "{{.Id}}") {
    return {
      exitCode: 0,
      stdout: `${image.Id ?? ""}\n`,
      stderr: ""
    };
  }

  return {
    exitCode: 0,
    stdout: `${JSON.stringify([image])}\n`,
    stderr: ""
  };
}

async function runDockerInspectCommand(
  client: DockerClientLike,
  args: string[]
): Promise<DockerWorkspaceCommandResult> {
  const type = readOptionValue(args, "--type");
  const targetName = requireCommandArgument(args, args.length - 1, "inspect target");

  switch (type) {
    case "container": {
      let container;
      try {
        container = await client.containerInspect(targetName);
      } catch (error) {
        if (isDockerNotFoundError(error)) {
          return missingDockerObjectResult("container", targetName);
        }

        throw error;
      }
      return {
        exitCode: 0,
        stdout: `${JSON.stringify([container])}\n`,
        stderr: ""
      };
    }
    default:
      return unsupportedDockerCommandResult(args);
  }
}

async function runDockerNetworkCommand(
  client: DockerClientLike,
  args: string[]
): Promise<DockerWorkspaceCommandResult> {
  const subcommand = args[1];
  const targetName = requireCommandArgument(args, 2, "network name");

  switch (subcommand) {
    case "inspect": {
      let network;
      try {
        network = await client.networkInspect(targetName);
      } catch (error) {
        if (isDockerNotFoundError(error)) {
          return missingDockerObjectResult("network", targetName);
        }

        throw error;
      }
      return {
        exitCode: 0,
        stdout: `${JSON.stringify([network])}\n`,
        stderr: ""
      };
    }
    case "rm":
      try {
        await client.networkDelete(targetName);
      } catch (error) {
        if (isDockerNotFoundError(error)) {
          return missingDockerObjectResult("network", targetName);
        }

        throw error;
      }
      return {
        exitCode: 0,
        stdout: "",
        stderr: ""
      };
    default:
      return unsupportedDockerCommandResult(args);
  }
}

async function runDockerVolumeCommand(
  client: DockerClientLike,
  args: string[]
): Promise<DockerWorkspaceCommandResult> {
  const subcommand = args[1];
  const targetName = requireCommandArgument(args, 2, "volume name");

  switch (subcommand) {
    case "inspect": {
      let volume;
      try {
        volume = await client.volumeInspect(targetName);
      } catch (error) {
        if (isDockerNotFoundError(error)) {
          return missingDockerObjectResult("volume", targetName);
        }

        throw error;
      }
      return {
        exitCode: 0,
        stdout: `${JSON.stringify([volume])}\n`,
        stderr: ""
      };
    }
    case "rm":
      try {
        await client.volumeDelete(targetName, { force: true });
      } catch (error) {
        if (isDockerNotFoundError(error)) {
          return missingDockerObjectResult("volume", targetName);
        }

        throw error;
      }
      return {
        exitCode: 0,
        stdout: "",
        stderr: ""
      };
    case "create": {
      const labels = readCliLabels(args);
      const volume = await client.volumeCreate({
        Name: targetName,
        Labels: labels
      } satisfies VolumeCreateOptions);
      return {
        exitCode: 0,
        stdout: `${volume.Name}\n`,
        stderr: ""
      };
    }
    default:
      return unsupportedDockerCommandResult(args);
  }
}

async function runDockerContainerDeleteCommand(
  client: DockerClientLike,
  args: string[]
): Promise<DockerWorkspaceCommandResult> {
  const targetName = requireCommandArgument(args, args.length - 1, "container name");
  try {
    await client.containerDelete(targetName, {
      force: args.includes("-f") || args.includes("--force")
    });
  } catch (error) {
    if (isDockerNotFoundError(error)) {
      return missingDockerObjectResult("container", targetName);
    }

    throw error;
  }
  return {
    exitCode: 0,
    stdout: "",
    stderr: ""
  };
}

async function runDockerContainerStopCommand(
  client: DockerClientLike,
  args: string[]
): Promise<DockerWorkspaceCommandResult> {
  const targetName = requireCommandArgument(args, args.length - 1, "container name");
  try {
    await client.containerStop(targetName);
  } catch (error) {
    if (isDockerNotFoundError(error)) {
      return missingDockerObjectResult("container", targetName);
    }

    throw error;
  }
  return {
    exitCode: 0,
    stdout: "",
    stderr: ""
  };
}

async function runDockerContainerStartCommand(
  client: DockerClientLike,
  args: string[]
): Promise<DockerWorkspaceCommandResult> {
  const targetName = requireCommandArgument(args, args.length - 1, "container name");
  try {
    await client.containerStart(targetName);
  } catch (error) {
    if (isDockerNotFoundError(error)) {
      return missingDockerObjectResult("container", targetName);
    }

    throw error;
  }
  return {
    exitCode: 0,
    stdout: "",
    stderr: ""
  };
}

async function runDockerExecCommand(
  client: DockerClientLike,
  args: string[],
  cliRunner: DockerCliCommandRunner
): Promise<DockerWorkspaceCommandResult> {
  const parsed = parseDockerExecCommand(args);
  const execConfig: ExecConfig = {
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    Cmd: parsed.command,
    Env: Object.entries(parsed.env).map(([key, value]) => `${key}=${value}`),
    WorkingDir: parsed.workdir ?? undefined
  };

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stdout = createStringCollector();
    const stderr = createStringCollector();

    try {
      const created = await client.containerExec(parsed.containerName, execConfig);
      await client.execStart(
        created.Id ?? "",
        stdout.writer,
        stderr.writer,
        {
          Detach: false,
          Tty: false
        } satisfies ExecStartConfig
      );

      const inspected = await client.execInspect(created.Id ?? "");

      return {
        exitCode: inspected.ExitCode ?? 1,
        stdout: stdout.value(),
        stderr: stderr.value()
      };
    } catch (error) {
      lastError = error;
      if (!isTransientDockerExecStartError(error)) {
        throw error;
      }

      if (attempt >= 2) {
        return await cliRunner({
          args,
          timeoutMs: 30_000
        });
      }
    }
  }

  throw lastError;
}

async function runDockerRunCommand(
  client: DockerClientLike,
  args: string[]
): Promise<DockerWorkspaceCommandResult> {
  const parsed = parseDockerRunCommand(args);
  const createRequest: ContainerCreateRequest = {
    Image: parsed.image,
    Cmd: parsed.command.length > 0 ? parsed.command : undefined,
    Entrypoint: parsed.entrypoint ?? undefined,
    Env: Object.entries(parsed.env).map(([key, value]) => `${key}=${value}`),
    Labels: parsed.labels,
    User: parsed.user ?? undefined,
    WorkingDir: parsed.workdir ?? undefined,
    HostConfig: {
      AutoRemove: false,
      NetworkMode: parsed.networkMode ?? undefined,
      ExtraHosts: parsed.extraHosts.length > 0 ? parsed.extraHosts : undefined,
      Binds: parsed.binds.length > 0 ? parsed.binds : undefined,
      PortBindings:
        Object.keys(parsed.portBindings).length > 0 ? parsed.portBindings : undefined,
      Tmpfs: Object.keys(parsed.tmpfs).length > 0 ? parsed.tmpfs : undefined,
      Mounts: parsed.mounts.length > 0 ? parsed.mounts : undefined
    },
    Tty: parsed.tty,
    OpenStdin: false,
    AttachStdout: !parsed.detached,
    AttachStderr: !parsed.detached
  };

  let created: { Id: string; Warnings?: string[] } | undefined;
  try {
    created = await client.containerCreate(
      createRequest,
      parsed.name ? { name: parsed.name } : undefined
    );
  } catch (error) {
    if (isDockerNotFoundError(error)) {
      return missingDockerObjectResult("image", parsed.image);
    }

    throw error;
  }

  try {
    try {
      await client.containerStart(created.Id);
    } catch (error) {
      if (isDockerNotFoundError(error)) {
        return missingDockerObjectResult("container", created.Id);
      }

      throw error;
    }

    if (parsed.detached) {
      return {
        exitCode: 0,
        stdout: `${created.Id}\n`,
        stderr: ""
      };
    }

    const waitResponse = await client.containerWait(created.Id);
    const stdout = createStringCollector();
    const stderr = createStringCollector();
    await client.containerLogs(created.Id, stdout.writer, stderr.writer, {
      follow: false,
      stdout: true,
      stderr: true,
      tail: "all"
    });

    return {
      exitCode: waitResponse.StatusCode,
      stdout: stdout.value(),
      stderr: stderr.value()
    };
  } finally {
    if (parsed.autoRemove && created) {
      await client.containerDelete(created.Id, { force: true }).catch(() => undefined);
    }
  }
}

function parseDockerRunCommand(args: string[]): {
  detached: boolean;
  autoRemove: boolean;
  name: string | null;
  image: string;
  entrypoint: string[] | null;
  command: string[];
  env: Record<string, string>;
  labels: Record<string, string>;
  binds: string[];
  mounts: Mount[];
  extraHosts: string[];
  portBindings: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  tmpfs: Record<string, string>;
  networkMode: string | null;
  user: string | null;
  workdir: string | null;
  tty: boolean;
} {
  const state = {
    detached: false,
    autoRemove: false,
    name: null as string | null,
    image: "",
    entrypoint: null as string[] | null,
    command: [] as string[],
    env: {} as Record<string, string>,
    labels: {} as Record<string, string>,
    binds: [] as string[],
    mounts: [] as Mount[],
    extraHosts: [] as string[],
    portBindings: {} as Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>,
    tmpfs: {} as Record<string, string>,
    networkMode: null as string | null,
    user: null as string | null,
    workdir: null as string | null,
    tty: false
  };

  let index = 1;
  while (index < args.length) {
    const token = args[index] ?? "";

    if (!token.startsWith("-")) {
      state.image = token;
      state.command = args.slice(index + 1);
      return state;
    }

    switch (token) {
      case "-d":
      case "--detach":
        state.detached = true;
        index += 1;
        continue;
      case "--rm":
        state.autoRemove = true;
        index += 1;
        continue;
      case "--name":
        state.name = requireOptionValue(args, index, token);
        index += 2;
        continue;
      case "--entrypoint":
        state.entrypoint = [requireOptionValue(args, index, token)];
        index += 2;
        continue;
      case "--env":
        assignKeyValue(state.env, requireOptionValue(args, index, token));
        index += 2;
        continue;
      case "--label":
        assignKeyValue(state.labels, requireOptionValue(args, index, token));
        index += 2;
        continue;
      case "--workdir":
        state.workdir = requireOptionValue(args, index, token);
        index += 2;
        continue;
      case "--user":
        state.user = requireOptionValue(args, index, token);
        index += 2;
        continue;
      case "--network":
        state.networkMode = requireOptionValue(args, index, token);
        index += 2;
        continue;
      case "--add-host":
        state.extraHosts.push(requireOptionValue(args, index, token));
        index += 2;
        continue;
      case "--publish":
        addPublishedPortMapping(
          state.portBindings,
          requireOptionValue(args, index, token)
        );
        index += 2;
        continue;
      case "--mount":
        state.mounts.push(parseMountOption(requireOptionValue(args, index, token)));
        index += 2;
        continue;
      case "--tmpfs":
        assignTmpfsValue(state.tmpfs, requireOptionValue(args, index, token));
        index += 2;
        continue;
      case "--tty":
      case "-t":
        state.tty = true;
        index += 1;
        continue;
      default:
        index += 1;
        continue;
    }
  }

  throw new TypeError("docker run requires an image name.");
}

function parseDockerExecCommand(args: string[]): {
  containerName: string;
  command: string[];
  env: Record<string, string>;
  workdir: string | null;
} {
  const state = {
    containerName: "",
    command: [] as string[],
    env: {} as Record<string, string>,
    workdir: null as string | null
  };

  let index = 1;
  while (index < args.length) {
    const token = args[index] ?? "";

    if (!token.startsWith("-")) {
      state.containerName = token;
      state.command = args.slice(index + 1);
      return state;
    }

    switch (token) {
      case "--env":
        assignKeyValue(state.env, requireOptionValue(args, index, token));
        index += 2;
        continue;
      case "--workdir":
        state.workdir = requireOptionValue(args, index, token);
        index += 2;
        continue;
      default:
        index += 1;
        continue;
    }
  }

  throw new TypeError("docker exec requires a container name.");
}

function parseMountOption(option: string): Mount {
  const parts = option.split(",");
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      flags.add(part);
      continue;
    }

    values.set(part.slice(0, separator), part.slice(separator + 1));
  }

  const type = values.get("type");
  const source = values.get("src") ?? values.get("source") ?? undefined;
  const target = values.get("dst") ?? values.get("target") ?? undefined;
  const readOnly = flags.has("ro") || values.get("readonly") === "true";

  if (!type || !target) {
    throw new TypeError(`Unsupported docker mount syntax: ${option}`);
  }

  return {
    Type: type as Mount["Type"],
    Source: source,
    Target: target,
    ReadOnly: readOnly || undefined
  };
}

function addPublishedPortMapping(
  portBindings: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>,
  value: string
): void {
  const [hostPortPart, containerPortPart] = value.split(":", 2);
  if (!hostPortPart || !containerPortPart) {
    throw new TypeError(`Unsupported docker publish syntax: ${value}`);
  }

  const containerPort = containerPortPart.includes("/")
    ? containerPortPart
    : `${containerPortPart}/tcp`;
  const hostPort = hostPortPart;
  portBindings[containerPort] = [
    {
      HostPort: hostPort
    }
  ];
}

function assignKeyValue(target: Record<string, string>, assignment: string): void {
  const separator = assignment.indexOf("=");
  if (separator === -1) {
    target[assignment] = "";
    return;
  }

  target[assignment.slice(0, separator)] = assignment.slice(separator + 1);
}

function assignTmpfsValue(target: Record<string, string>, value: string): void {
  const separator = value.indexOf(":");
  if (separator === -1) {
    target[value] = "";
    return;
  }

  target[value.slice(0, separator)] = value.slice(separator + 1);
}

function readOptionValue(args: string[], option: string): string | null {
  const index = args.indexOf(option);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

function readFormatOption(args: string[], startIndex: number): string | null {
  for (let index = startIndex; index < args.length; index += 1) {
    if (args[index] === "--format") {
      return args[index + 1] ?? null;
    }
  }

  return null;
}

function requireOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new TypeError(`docker ${option} requires a value.`);
  }

  return value;
}

function requireCommandArgument(
  args: string[],
  index: number,
  label: string
): string {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    throw new TypeError(`docker command requires a ${label}.`);
  }

  return value;
}

function readCliLabels(args: string[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--label") {
      continue;
    }

    const assignment = args[index + 1];
    if (typeof assignment === "string") {
      assignKeyValue(labels, assignment);
    }
  }

  return labels;
}

function createStringCollector(): {
  writer: Writable;
  value: () => string;
} {
  let buffer = "";
  const writer = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      callback();
    }
  });

  return {
    writer,
    value: () => buffer
  };
}

function unsupportedDockerCommandResult(args: string[]): DockerWorkspaceCommandResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: `Unsupported docker command: ${sanitizeDockerArgs(args).join(" ")}`
  };
}

function missingDockerObjectResult(
  kind: "container" | "image" | "network" | "volume",
  name: string
): DockerWorkspaceCommandResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: `Error response from daemon: No such ${kind}: ${name}`
  };
}

function renderDockerErrorResult(
  args: string[],
  error: unknown
): DockerWorkspaceCommandResult {
  if (isDockerNotFoundError(error)) {
    const targetName = args.at(-1) ?? "unknown";
    const kind = inferDockerObjectKind(args);
    return missingDockerObjectResult(kind, targetName);
  }

  if (error instanceof SymphonyWorkspaceError) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: error.message
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    exitCode: 1,
    stdout: "",
    stderr: [
      `docker ${args[0] ?? "command"} failed.`,
      message
    ].join("\n")
  };
}

function isDockerNotFoundError(error: unknown): boolean {
  if (error instanceof NotFoundError) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof (error as { name?: unknown }).name === "string" &&
    (error as { name: string }).name === "NotFoundError"
  ) {
    return true;
  }

  const rendered =
    error instanceof Error
      ? `${error.name}\n${error.message}`
      : String(error);

  return /NotFoundError|not found|no such (?:object|container|network|volume|image)/i.test(
    rendered
  );
}

function isTransientDockerExecStartError(error: unknown): boolean {
  const rendered =
    error instanceof Error
      ? `${error.name}\n${error.message}`
      : String(error);

  return /bad upgrade|upgrade request|required hijack|unexpected eof/i.test(
    rendered
  );
}

function inferDockerObjectKind(
  args: string[]
): "container" | "image" | "network" | "volume" {
  switch (args[0]) {
    case "image":
      return "image";
    case "network":
      return "network";
    case "volume":
      return "volume";
    default:
      return "container";
  }
}

async function withDockerTimeout<T>(
  timeoutMs: number,
  operation: () => Promise<T>
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new SymphonyWorkspaceError(
          "workspace_docker_timeout",
          `Docker command timed out after ${timeoutMs}ms.`
        )
      );
    }, timeoutMs);

    operation()
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

async function runDockerCliCommand(
  input: DockerWorkspaceCommandInput
): Promise<DockerWorkspaceCommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("docker", input.args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: DockerWorkspaceCommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      fail(
        new SymphonyWorkspaceError(
          "workspace_docker_timeout",
          `Docker command timed out after ${input.timeoutMs}ms.`
        )
      );
    }, input.timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      fail(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      finish({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function sanitizeDockerArgs(args: string[]): string[] {
  const sanitized = [...args];

  for (let index = 0; index < sanitized.length - 1; index += 1) {
    if (sanitized[index] !== "--env") {
      continue;
    }

    sanitized[index + 1] = redactDockerEnvAssignment(sanitized[index + 1] ?? "");
  }

  return sanitized;
}

function redactDockerEnvAssignment(assignment: string): string {
  const separator = assignment.indexOf("=");
  if (separator === -1) {
    return assignment;
  }

  const key = assignment.slice(0, separator);
  const value = assignment.slice(separator + 1);
  return `${key}=${shouldRedactDockerEnvValue(key) ? "<redacted>" : value}`;
}
