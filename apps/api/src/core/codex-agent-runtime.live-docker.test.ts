import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDockerWorkspaceBackend,
  defaultSymphonyDockerWorkspaceImage,
  preflightSymphonyDockerWorkspaceImage
} from "@symphony/workspace";
import {
  normalizeSymphonyRuntimeManifest,
  type SymphonyLoadedRuntimeManifest
} from "@symphony/runtime-contract";
import {
  createSqliteSymphonyRunJournal,
  initializeSymphonyDb
} from "@symphony/db";
import { createSilentSymphonyLogger } from "@symphony/logger";
import type { SymphonyAgentRuntimeCompletion } from "@symphony/orchestrator";
import {
  buildSymphonyRuntimeTrackerIssue,
  buildSymphonyRuntimeWorkflowConfig
} from "../test-support/create-symphony-runtime-test-harness.js";
import { resolveDockerCodexAuthContract } from "./codex-auth-contract.js";
import { createCodexSymphonyAgentRuntime } from "./codex-agent-runtime.js";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true
      })
    )
  );
});

describe.runIf(process.env.SYMPHONY_LIVE_DOCKER_VERIFY === "1")(
  "live docker codex runtime verification",
  () => {
    it(
      "exercises prepare, runtime execution, and cleanup against a real Docker daemon",
      async () => {
        await assertDockerAvailable();

        const root = await mkdtemp(path.join(tmpdir(), "symphony-live-docker-"));
        tempRoots.push(root);

        const workspaceRoot = path.join(root, "workspaces");
        await mkdir(workspaceRoot, {
          recursive: true
        });

        const issue = buildSymphonyRuntimeTrackerIssue({
          state: "In Progress"
        });
        const workflowConfig = buildSymphonyRuntimeWorkflowConfig(root, {
          workspace: {
            root: workspaceRoot
          },
          hooks: {
            ...buildSymphonyRuntimeWorkflowConfig(root).hooks,
            afterCreate: null,
            timeoutMs: 30_000
          },
          codex: {
            ...buildSymphonyRuntimeWorkflowConfig(root).codex,
            command: "./.symphony/fake-codex.sh app-server",
            readTimeoutMs: 30_000,
            turnTimeoutMs: 30_000
          }
        });
        const backend = createDockerWorkspaceBackend({
          image:
            process.env.SYMPHONY_DOCKER_WORKSPACE_IMAGE ??
            defaultSymphonyDockerWorkspaceImage,
          shell: "sh",
          commandTimeoutMs: 30_000
        });
        const workspace = await backend.prepareWorkspace({
          context: {
            issueId: issue.id,
            issueIdentifier: issue.identifier
          },
          config: workflowConfig.workspace,
          hooks: workflowConfig.hooks
        });
        const hostWorkspacePath = requireContainerHostWorkspacePath(workspace);
        await writeFakeCodexBinary(hostWorkspacePath);
        await initializeGitWorkspace(hostWorkspacePath);

        const database = initializeSymphonyDb({
          dbFile: path.join(root, "symphony.db")
        });
        const runJournal = createSqliteSymphonyRunJournal({
          db: database.db,
          dbFile: path.join(root, "symphony.db")
        });
        const runId = await runJournal.recordRunStarted({
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          status: "dispatching",
          workspacePath: hostWorkspacePath,
          startedAt: "2026-04-01T00:00:00.000Z"
        });

        let completion: SymphonyAgentRuntimeCompletion | null = null;
        const completionPromise = new Promise<void>((resolve) => {
          const runtime = createCodexSymphonyAgentRuntime({
            promptTemplate: "You are working on {{ issue.identifier }}.",
            tracker: createDoneTracker(issue),
            runJournal,
            runtimeLogs: {
              async record() {
                return "log-1";
              },
              async list() {
                return [];
              }
            },
            hostCommandEnvSource: process.env,
            logger: createSilentSymphonyLogger("@symphony/api.live-docker"),
            callbacks: {
              async onUpdate() {
                return;
              },
              async onComplete(_issueId, result) {
                completion = result;
                resolve();
              }
            }
          });

          void runtime.startRun({
            issue,
            runId,
            attempt: 1,
            workflowConfig,
            workspace
          });
        });

        await completionPromise;

        expect(completion).toEqual({
          kind: "normal"
        });

        await backend.cleanupWorkspace({
          issueIdentifier: issue.identifier,
          workspace,
          config: workflowConfig.workspace,
          hooks: workflowConfig.hooks
        });

        await expect(
          execFileAsync("docker", [
            "inspect",
            workspace.executionTarget.kind === "container"
              ? workspace.executionTarget.containerName ?? ""
              : ""
          ])
        ).rejects.toBeDefined();
        await expect(stat(hostWorkspacePath)).rejects.toMatchObject({
          code: "ENOENT"
        });

        database.close();
      },
      120_000
    );

    it(
      "reuses an existing prepared Docker workspace on the second prepare before cleanup",
      async () => {
        await assertDockerAvailable();

        const root = await mkdtemp(
          path.join(tmpdir(), "symphony-live-docker-reuse-")
        );
        tempRoots.push(root);

        const workspaceRoot = path.join(root, "workspaces");
        await mkdir(workspaceRoot, {
          recursive: true
        });

        const issue = buildSymphonyRuntimeTrackerIssue({
          state: "In Progress"
        });
        const workflowConfig = buildSymphonyRuntimeWorkflowConfig(root, {
          workspace: {
            root: workspaceRoot
          },
          hooks: {
            ...buildSymphonyRuntimeWorkflowConfig(root).hooks,
            afterCreate: null,
            timeoutMs: 30_000
          },
          codex: {
            ...buildSymphonyRuntimeWorkflowConfig(root).codex,
            command: "./.symphony/fake-codex.sh app-server",
            readTimeoutMs: 30_000,
            turnTimeoutMs: 30_000
          }
        });
        const backend = createDockerWorkspaceBackend({
          image:
            process.env.SYMPHONY_DOCKER_WORKSPACE_IMAGE ??
            defaultSymphonyDockerWorkspaceImage,
          shell: "sh",
          commandTimeoutMs: 30_000
        });

        const first = await backend.prepareWorkspace({
          context: {
            issueId: issue.id,
            issueIdentifier: issue.identifier
          },
          config: workflowConfig.workspace,
          hooks: workflowConfig.hooks
        });
        const hostWorkspacePath = requireContainerHostWorkspacePath(first);
        await writeFakeCodexBinary(hostWorkspacePath);
        await initializeGitWorkspace(hostWorkspacePath);

        const second = await backend.prepareWorkspace({
          context: {
            issueId: issue.id,
            issueIdentifier: issue.identifier
          },
          config: workflowConfig.workspace,
          hooks: workflowConfig.hooks
        });

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(second.executionTarget).toEqual(first.executionTarget);

        const database = initializeSymphonyDb({
          dbFile: path.join(root, "symphony.db")
        });
        const runJournal = createSqliteSymphonyRunJournal({
          db: database.db,
          dbFile: path.join(root, "symphony.db")
        });
        const runId = await runJournal.recordRunStarted({
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          status: "dispatching",
          workspacePath: hostWorkspacePath,
          startedAt: "2026-04-01T00:00:00.000Z"
        });

        let completion: SymphonyAgentRuntimeCompletion | null = null;
        const completionPromise = new Promise<void>((resolve) => {
          const runtime = createCodexSymphonyAgentRuntime({
            promptTemplate: "You are working on {{ issue.identifier }}.",
            tracker: createDoneTracker(issue),
            runJournal,
            runtimeLogs: {
              async record() {
                return "log-1";
              },
              async list() {
                return [];
              }
            },
            hostCommandEnvSource: process.env,
            logger: createSilentSymphonyLogger("@symphony/api.live-docker"),
            callbacks: {
              async onUpdate() {
                return;
              },
              async onComplete(_issueId, result) {
                completion = result;
                resolve();
              }
            }
          });

          void runtime.startRun({
            issue,
            runId,
            attempt: 1,
            workflowConfig,
            workspace: second
          });
        });

        await completionPromise;

        expect(completion).toEqual({
          kind: "normal"
        });

        await backend.cleanupWorkspace({
          issueIdentifier: issue.identifier,
          workspace: second,
          config: workflowConfig.workspace,
          hooks: workflowConfig.hooks
        });

        await expect(
          execFileAsync("docker", [
            "inspect",
            second.executionTarget.kind === "container"
              ? second.executionTarget.containerName ?? ""
              : ""
          ])
        ).rejects.toBeDefined();
        await expect(stat(hostWorkspacePath)).rejects.toMatchObject({
          code: "ENOENT"
        });

        database.close();
      },
      120_000
    );

    it(
      "projects repo env into a real Docker workspace, runs manifest lifecycle, and proves auth-json is mounted separately from repo env",
      async () => {
        await assertDockerAvailable();

        const image =
          process.env.SYMPHONY_DOCKER_WORKSPACE_IMAGE ??
          defaultSymphonyDockerWorkspaceImage;

        await preflightSymphonyDockerWorkspaceImage({
          image,
          timeoutMs: 30_000
        });

        const root = await mkdtemp(
          path.join(tmpdir(), "symphony-live-docker-contract-")
        );
        tempRoots.push(root);

        const workspaceRoot = path.join(root, "workspaces");
        const repoRoot = path.join(root, "repo");
        const home = path.join(root, "home");
        const authDir = path.join(home, ".codex");

        await mkdir(workspaceRoot, { recursive: true });
        await mkdir(path.join(repoRoot, ".symphony"), { recursive: true });
        await mkdir(authDir, { recursive: true });
        await writeFile(
          path.join(authDir, "auth.json"),
          '{"account":"chatgpt"}\n',
          "utf8"
        );

        const runtimeManifest = buildLiveDockerContractManifest(repoRoot);
        const dockerCodexAuth = resolveDockerCodexAuthContract({
          HOME: home
        });
        expect(dockerCodexAuth.mode).toBe("auth_json");

        const backend = createDockerWorkspaceBackend({
          image,
          runtimeManifest,
          hostFileMounts:
            dockerCodexAuth.mount === null ? [] : [dockerCodexAuth.mount],
          commandTimeoutMs: 30_000
        });

        const workspace = await backend.prepareWorkspace({
          context: {
            issueId: "issue-contract",
            issueIdentifier: "COL-610"
          },
          runId: "run-contract",
          config: {
            root: workspaceRoot
          },
          hooks: {
            afterCreate: null,
            beforeRun: null,
            afterRun: null,
            beforeRemove: null,
            timeoutMs: 30_000
          },
          env: {
            GITHUB_TOKEN: "host-github-token",
            REPO_ONLY_SECRET: "repo-secret",
            OPTIONAL_REPO_VALUE: "repo-optional",
            ...(dockerCodexAuth.launchEnv ?? {})
          }
        });

        const hostWorkspacePath = requireContainerHostWorkspacePath(workspace);
        const report = JSON.parse(
          await readFile(
            path.join(hostWorkspacePath, ".symphony-contract-report.json"),
            "utf8"
          )
        ) as Record<string, string | boolean | null>;

        expect(workspace.envBundle.source).toBe("manifest");
        expect(workspace.envBundle.values).toMatchObject({
          GITHUB_TOKEN: "host-github-token",
          CODEX_HOME: "/home/agent",
          REPO_ONLY_SECRET: "repo-secret",
          OPTIONAL_REPO_VALUE: "repo-optional",
          STATIC_MARKER: "present",
          SYMPHONY_BACKEND_KIND: "docker"
        });
        expect(workspace.envBundle.values.OPENAI_API_KEY).toBeUndefined();
        expect(
          workspace.manifestLifecycle?.phases.find(
            (phase) => phase.phase === "verify"
          )
        ).toMatchObject({
          phase: "verify",
          status: "completed",
          trigger: "readiness_lifetime"
        });
        expect(report).toMatchObject({
          githubToken: "host-github-token",
          repoOnlySecret: "repo-secret",
          optionalRepoValue: "repo-optional",
          staticMarker: "present",
          backendKind: "docker",
          codexHome: "/home/agent",
          openAiApiKey: null,
          authExists: true,
          authStatusCode: 0
        });

        await backend.cleanupWorkspace({
          issueIdentifier: "COL-610",
          workspace,
          config: {
            root: workspaceRoot
          },
          hooks: {
            afterCreate: null,
            beforeRun: null,
            afterRun: null,
            beforeRemove: null,
            timeoutMs: 30_000
          }
        });
      },
      120_000
    );

    it(
      "fails preflight against the real image when the codex binary is missing",
      async () => {
        await assertDockerAvailable();
        const root = await mkdtemp(
          path.join(tmpdir(), "symphony-live-docker-no-codex-")
        );
        tempRoots.push(root);

        await expect(
          preflightSymphonyDockerWorkspaceImage({
            image: await buildLocalImageWithoutCodex(root),
            timeoutMs: 30_000
          })
        ).rejects.toThrowError(/missing required tools: .*codex/i);
      },
      120_000
    );
  }
);

async function assertDockerAvailable(): Promise<void> {
  try {
    await execFileAsync("docker", ["version", "--format", "{{.Server.Version}}"], {
      timeout: 15_000
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Docker is not available for live verification: ${reason}`, {
      cause: error
    });
  }
}

function buildLiveDockerContractManifest(
  repoRoot: string
): SymphonyLoadedRuntimeManifest {
  const contractReportScript =
    'const fs=require("node:fs");' +
    'const {spawnSync}=require("node:child_process");' +
    'const authStatusResult=spawnSync("codex",["login","status"],{encoding:"utf8"});' +
    'const report={' +
    'githubToken:process.env.GITHUB_TOKEN??null,' +
    'repoOnlySecret:process.env.REPO_ONLY_SECRET??null,' +
    'optionalRepoValue:process.env.OPTIONAL_REPO_VALUE??null,' +
    'staticMarker:process.env.STATIC_MARKER??null,' +
    'backendKind:process.env.SYMPHONY_BACKEND_KIND??null,' +
    'codexHome:process.env.CODEX_HOME??null,' +
    'openAiApiKey:process.env.OPENAI_API_KEY??null,' +
    'authExists:fs.existsSync(((process.env.CODEX_HOME??process.env.HOME??""))+"/auth.json"),' +
    'authStatusCode:authStatusResult.status,' +
    'authStatus:authStatusResult.stdout.trim(),' +
    'authStatusError:authStatusResult.stderr.trim()' +
    '};' +
    'fs.writeFileSync(".symphony-contract-report.json",JSON.stringify(report));';

  return {
    repoRoot,
    manifestPath: path.join(repoRoot, ".symphony", "runtime.ts"),
    manifest: normalizeSymphonyRuntimeManifest({
      schemaVersion: 1,
      workspace: {
        packageManager: "pnpm"
      },
        env: {
          host: {
            required: ["GITHUB_TOKEN", "REPO_ONLY_SECRET"],
            optional: ["CODEX_HOME", "OPTIONAL_REPO_VALUE"]
          },
          inject: {
          STATIC_MARKER: {
            kind: "static",
            value: "present"
          },
          SYMPHONY_BACKEND_KIND: {
            kind: "runtime",
            value: "backendKind"
          }
        }
      },
      lifecycle: {
        bootstrap: [],
        migrate: [],
        verify: [
          {
            name: "contract-report",
            run: `node -e ${JSON.stringify(contractReportScript)}`
          }
        ],
        seed: [],
        cleanup: []
      }
    })
  };
}

async function buildLocalImageWithoutCodex(root: string): Promise<string> {
  const imageTag = `symphony/workspace-runner:no-codex-${Date.now()}`;
  const dockerfileDir = path.join(root, "no-codex-image");

  await mkdir(dockerfileDir, {
    recursive: true
  });
  await writeFile(
    path.join(dockerfileDir, "Dockerfile"),
    [
      "FROM symphony/workspace-runner:local",
      "RUN rm -f /usr/local/bin/codex"
    ].join("\n"),
    "utf8"
  );

  await execFileAsync("docker", ["build", "-t", imageTag, dockerfileDir], {
    cwd: root
  });

  return imageTag;
}

async function initializeGitWorkspace(workspacePath: string): Promise<void> {
  await execFileAsync("git", ["init"], {
    cwd: workspacePath
  });
  await execFileAsync("git", ["config", "user.name", "Symphony Test"], {
    cwd: workspacePath
  });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], {
    cwd: workspacePath
  });
  await execFileAsync("git", ["add", ".symphony/fake-codex.sh"], {
    cwd: workspacePath
  });
  await execFileAsync("git", ["commit", "-m", "init"], {
    cwd: workspacePath
  });
}

async function writeFakeCodexBinary(workspacePath: string): Promise<void> {
  const scriptPath = path.join(workspacePath, ".symphony", "fake-codex.sh");
  await mkdir(path.dirname(scriptPath), {
    recursive: true
  });
  await writeFile(
    scriptPath,
    `#!/bin/sh
count=0
while IFS= read -r _line; do
  count=$((count + 1))
  case "$count" in
    1)
      printf '%s\\n' '{"id":1,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-live-docker"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-live-docker"}}}'
      printf '%s\\n' '{"method":"thread/tokenUsage/updated","params":{"tokenUsage":{"total":{"inputTokens":5,"outputTokens":2,"totalTokens":7}}}}'
      printf '%s\\n' '{"method":"turn/completed","params":{"result":"ok"}}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
  );
  await chmod(scriptPath, 0o755);
}

function requireContainerHostWorkspacePath(workspace: Awaited<
  ReturnType<ReturnType<typeof createDockerWorkspaceBackend>["prepareWorkspace"]>
>): string {
  if (
    workspace.executionTarget.kind === "container" &&
    workspace.executionTarget.hostPath
  ) {
    return workspace.executionTarget.hostPath;
  }

  throw new TypeError("Live Docker verification requires a bind-mounted workspace.");
}

function createDoneTracker(
  issue: ReturnType<typeof buildSymphonyRuntimeTrackerIssue>
) {
  return {
    async fetchCandidateIssues() {
      return [issue];
    },
    async fetchIssuesByStates() {
      return [issue];
    },
    async fetchIssueStatesByIds() {
      return [
        {
          ...issue,
          state: "Done"
        }
      ];
    },
    async fetchIssueByIdentifier() {
      return issue;
    },
    async createComment() {
      return;
    },
    async updateIssueState() {
      return;
    }
  };
}
