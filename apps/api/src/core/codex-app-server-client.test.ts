import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { SymphonyResolvedWorkflowConfig } from "@symphony/core";
import type { SymphonyTrackerIssue } from "@symphony/core/tracker";
import {
  buildSymphonyRuntimeTrackerIssue,
  buildSymphonyRuntimeWorkflowConfig
} from "../test-support/create-symphony-runtime-test-harness.js";
import {
  CodexAppServerClient,
  CodexAppServerError,
  type CodexAppServerSession
} from "./codex-app-server-client.js";

const tempRoots: string[] = [];
const originalPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = originalPath;
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("codex app server client", () => {
  it("rejects the workspace root, outside-root paths, and symlink escapes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-guard-"));
    tempRoots.push(root);

    const workspaceRoot = path.join(root, "workspaces");
    const outsideWorkspace = path.join(root, "outside");
    const fakeCodex = path.join(root, "fake-codex.sh");

    await mkdir(workspaceRoot, { recursive: true });
    await mkdir(outsideWorkspace, { recursive: true });
    await writeExecutable(fakeCodex, "#!/bin/sh\nexit 0\n");

    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const workflowConfig = buildSymphonyRuntimeWorkflowConfig(root, {
      workspace: {
        root: workspaceRoot
      },
      codex: {
        ...buildSymphonyRuntimeWorkflowConfig(root).codex,
        command: `${fakeCodex} app-server`
      }
    });
    const loggerSpy = createLoggerSpy();

    await expect(
      CodexAppServerClient.startSession({
        launchTarget: buildHostLaunchTarget(workspaceRoot),
        env: defaultLaunchEnv(),
        hostCommandEnvSource: defaultHostCommandEnvSource(),
        workflowConfig,
        issue,
        logger: loggerSpy.logger
      })
    ).rejects.toSatisfy(
      (error) =>
        error instanceof CodexAppServerError &&
        error.code === "invalid_workspace_cwd" &&
        asRecord(error.detail)?.reason === "workspace_root"
    );

    await expect(
      CodexAppServerClient.startSession({
        launchTarget: buildHostLaunchTarget(outsideWorkspace),
        env: defaultLaunchEnv(),
        hostCommandEnvSource: defaultHostCommandEnvSource(),
        workflowConfig,
        issue,
        logger: loggerSpy.logger
      })
    ).rejects.toSatisfy(
      (error) =>
        error instanceof CodexAppServerError &&
        error.code === "invalid_workspace_cwd" &&
        asRecord(error.detail)?.reason === "outside_workspace_root"
    );

    const symlinkWorkspace = path.join(workspaceRoot, "COL-1000");
    await symlink(outsideWorkspace, symlinkWorkspace);

    await expect(
      CodexAppServerClient.startSession({
        launchTarget: buildHostLaunchTarget(symlinkWorkspace),
        env: defaultLaunchEnv(),
        hostCommandEnvSource: defaultHostCommandEnvSource(),
        workflowConfig,
        issue,
        logger: loggerSpy.logger
      })
    ).rejects.toSatisfy(
      (error) =>
        error instanceof CodexAppServerError &&
        error.code === "invalid_workspace_cwd" &&
        asRecord(error.detail)?.reason === "symlink_escape"
    );
  });

  it("injects issue label launch overrides and sends the Linear dynamic tool spec", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-launch-"));
    tempRoots.push(root);

    const traceFile = path.join(root, "launch.trace");
    const scenario = await createScenario({
      root,
      issueOverrides: {
        labels: ["symphony:model:gpt-5.3-codex-spark", "symphony:reasoning:high"]
      },
      command: undefined,
      script: `#!/bin/sh
trace_file="${traceFile}"
count=0
printf 'ARGV:%s\\n' "$*" >> "$trace_file"
printf 'ENV_OPENAI:%s\\n' "$OPENAI_API_KEY" >> "$trace_file"
while IFS= read -r line; do
  count=$((count + 1))
  printf 'JSON:%s\\n' "$line" >> "$trace_file"
  case "$count" in
    1)
      printf '%s\\n' '{"id":1,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-launch"}}}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    });

    scenario.workflowConfig = {
      ...scenario.workflowConfig,
      codex: {
        ...scenario.workflowConfig.codex,
        command: `${scenario.fakeCodex} app-server --model gpt-5.4`
      }
    };

    const session = await CodexAppServerClient.startSession({
      launchTarget: buildHostLaunchTarget(scenario.workspacePath),
      env: defaultLaunchEnv(),
      hostCommandEnvSource: defaultHostCommandEnvSource(),
      workflowConfig: scenario.workflowConfig,
      issue: scenario.issue,
      logger: scenario.loggerSpy.logger
    });
    session.client.close();

    const lines = await readTraceLines(traceFile);
    const argvLine = lines.find((line) => line.startsWith("ARGV:")) ?? "";
    expect(argvLine).not.toBe("");
    expect(argvLine).toContain(
      "--model gpt-5.3-codex-spark --config model_reasoning_effort=high app-server"
    );
    expect(argvLine).not.toContain("--model gpt-5.4 app-server");
    expect(lines).toContain("ENV_OPENAI:test-openai-api-key");

    const tracePayloads = parseTraceJsonLines(lines);
    const threadStart = tracePayloads.find((payload) => payload.id === 2);
    expect(getParams(threadStart)?.dynamicTools).toEqual([
      expect.objectContaining({
        name: "linear_graphql",
        inputSchema: expect.objectContaining({
          required: ["query"]
        })
      })
    ]);
  });

  it("uses the host workspace as spawn cwd while sending container cwd to thread and turn start", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-container-"));
    tempRoots.push(root);

    const dockerTraceFile = path.join(root, "docker.trace");
    const codexTraceFile = path.join(root, "codex.trace");
    const scenario = await createScenario({
      root,
      script: `#!/bin/sh
trace_file="${codexTraceFile}"
count=0
while IFS= read -r line; do
  count=$((count + 1))
  printf 'JSON:%s\\n' "$line" >> "$trace_file"
  case "$count" in
    1)
      printf '%s\\n' '{"id":1,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-container"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-container"}}}'
      printf '%s\\n' '{"method":"turn/completed"}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    });

    const fakeDocker = path.join(root, "docker");
    await writeExecutable(
      fakeDocker,
      `#!/bin/sh
trace_file="${dockerTraceFile}"
printf 'PWD:%s\\n' "$(pwd)" >> "$trace_file"
printf 'ARGV:%s\\n' "$*" >> "$trace_file"
if [ "$1" != "exec" ]; then
  echo "unexpected docker command: $1" >&2
  exit 99
fi
shift
workdir=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -i)
      shift
      ;;
    --env)
      printf 'ENV:%s\\n' "$2" >> "$trace_file"
      shift 2
      ;;
    --workdir)
      workdir="$2"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done
container_name="$1"
shift
shell_bin="$1"
shift
printf 'WORKDIR:%s\\n' "$workdir" >> "$trace_file"
printf 'CONTAINER:%s\\n' "$container_name" >> "$trace_file"
exec "$shell_bin" -lc "$2"
`
    );
    process.env.PATH = `${root}:${originalPath ?? ""}`;

    const session = await CodexAppServerClient.startSession({
      launchTarget: buildContainerLaunchTarget(scenario.workspacePath),
      env: defaultLaunchEnv(),
      hostCommandEnvSource: defaultHostCommandEnvSource(),
      workflowConfig: scenario.workflowConfig,
      issue: scenario.issue,
      logger: scenario.loggerSpy.logger
    });
    const turn = runTurnForScenario(scenario, session);
    await expect(turn.promise).resolves.toBeDefined();

    const dockerTraceLines = await readTraceLines(dockerTraceFile);
    expect(dockerTraceLines).toContain(`PWD:${session.hostLaunchPath}`);
    expect(dockerTraceLines).toContain("WORKDIR:/home/agent/workspace");
    expect(dockerTraceLines).toContain("CONTAINER:symphony-col-123-container");
    expect(dockerTraceLines).toContain("ENV:OPENAI_API_KEY=test-openai-api-key");

    const tracePayloads = parseTraceJsonLines(await readTraceLines(codexTraceFile));
    const threadStart = tracePayloads.find((payload) => payload.id === 2);
    const turnStart = tracePayloads.find((payload) => payload.id === 3);
    expect(getParams(threadStart)?.cwd).toBe("/home/agent/workspace");
    expect(getParams(turnStart)?.cwd).toBe("/home/agent/workspace");
  });

  it("passes the configured turn sandbox policy unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-sandbox-"));
    tempRoots.push(root);

    const traceFile = path.join(root, "sandbox.trace");
    const policy = {
      type: "futureSandbox",
      nested: {
        flag: true
      }
    };
    const scenario = await createScenario({
      root,
      workflowOverrides: {
        codex: {
          ...buildSymphonyRuntimeWorkflowConfig(root).codex,
          turnSandboxPolicy: policy
        }
      },
      script: `#!/bin/sh
trace_file="${traceFile}"
count=0
while IFS= read -r line; do
  count=$((count + 1))
  printf 'JSON:%s\\n' "$line" >> "$trace_file"
  case "$count" in
    1)
      printf '%s\\n' '{"id":1,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-sandbox"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-sandbox"}}}'
      printf '%s\\n' '{"method":"turn/completed"}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    });

    const { session } = await startSessionForScenario(scenario);
    const turn = runTurnForScenario(scenario, session);
    await expect(turn.promise).resolves.toBeDefined();

    const tracePayloads = parseTraceJsonLines(await readTraceLines(traceFile));
    const turnStart = tracePayloads.find((payload) => payload.id === 3);
    expect(getParams(turnStart)?.sandboxPolicy).toEqual(policy);
  });

  it("marks input-required turn events as a hard failure", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-input-"));
    tempRoots.push(root);

    const scenario = await createScenario({
      root,
      script: `#!/bin/sh
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
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-input"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-input"}}}'
      printf '%s\\n' '{"method":"turn/input_required","params":{"requiresInput":true,"reason":"blocked"}}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    });

    const { session } = await startSessionForScenario(scenario);
    const turn = runTurnForScenario(scenario, session);

    await expect(turn.promise).rejects.toSatisfy(
      (error) =>
        error instanceof CodexAppServerError &&
        error.code === "turn_input_required"
    );
    expect(turn.messages.map((message) => message.event)).toContain(
      "turn_input_required"
    );
  });

  it("fails when command approval is required under safer defaults", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-approval-"));
    tempRoots.push(root);

    const scenario = await createScenario({
      root,
      script: `#!/bin/sh
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
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-approval"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-approval"}}}'
      printf '%s\\n' '{"id":99,"method":"item/commandExecution/requestApproval","params":{"command":"gh pr view","cwd":"/tmp","reason":"need approval"}}'
      ;;
    *)
      sleep 1
      ;;
  esac
done
`
    });

    const { session } = await startSessionForScenario(scenario);
    const turn = runTurnForScenario(scenario, session);

    await expect(turn.promise).rejects.toSatisfy(
      (error) =>
        error instanceof CodexAppServerError &&
        error.code === "approval_required"
    );
    expect(turn.messages.map((message) => message.event)).toContain(
      "approval_required"
    );
  });

  it("auto-approves command execution approval requests when approval policy is never", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-auto-approve-"));
    tempRoots.push(root);

    const traceFile = path.join(root, "auto-approve.trace");
    const scenario = await createScenario({
      root,
      workflowOverrides: {
        codex: {
          ...buildSymphonyRuntimeWorkflowConfig(root).codex,
          approvalPolicy: "never"
        }
      },
      script: `#!/bin/sh
trace_file="${traceFile}"
count=0
while IFS= read -r line; do
  count=$((count + 1))
  printf 'JSON:%s\\n' "$line" >> "$trace_file"
  case "$count" in
    1)
      printf '%s\\n' '{"id":1,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-auto-approve"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-auto-approve"}}}'
      printf '%s\\n' '{"id":99,"method":"item/commandExecution/requestApproval","params":{"command":"gh pr view","cwd":"/tmp","reason":"need approval"}}'
      ;;
    5)
      printf '%s\\n' '{"method":"turn/completed"}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    });

    const { session } = await startSessionForScenario(scenario);
    const turn = runTurnForScenario(scenario, session);
    await expect(turn.promise).resolves.toBeDefined();

    const lines = await readTraceLines(traceFile);
    const tracePayloads = parseTraceJsonLines(lines);
    expect(
      tracePayloads.some(
        (payload) =>
          payload.id === 99 &&
          getResult(payload)?.decision === "acceptForSession"
      )
    ).toBe(true);
    expect(turn.messages.map((message) => message.event)).toContain(
      "approval_auto_approved"
    );
    expect(turn.messages.map((message) => message.event)).toContain(
      "turn_completed"
    );
  });

  it("auto-answers MCP approval prompts and generic tool input prompts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-tool-input-"));
    tempRoots.push(root);

    const traceFile = path.join(root, "tool-input.trace");
    const scenario = await createScenario({
      root,
      workflowOverrides: {
        codex: {
          ...buildSymphonyRuntimeWorkflowConfig(root).codex,
          approvalPolicy: "never"
        }
      },
      script: `#!/bin/sh
trace_file="${traceFile}"
count=0
while IFS= read -r line; do
  count=$((count + 1))
  printf 'JSON:%s\\n' "$line" >> "$trace_file"
  case "$count" in
    1)
      printf '%s\\n' '{"id":1,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-tool-input"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-tool-input"}}}'
      printf '%s\\n' '{"id":110,"method":"item/tool/requestUserInput","params":{"questions":[{"id":"approval","options":[{"label":"Approve Once"},{"label":"Approve this Session"},{"label":"Deny"}]}]}}'
      ;;
    5)
      printf '%s\\n' '{"id":111,"method":"item/tool/requestUserInput","params":{"questions":[{"id":"freeform","question":"What should I do next?"}]}}'
      ;;
    6)
      printf '%s\\n' '{"method":"turn/completed"}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    });

    const { session } = await startSessionForScenario(scenario);
    const turn = runTurnForScenario(scenario, session);
    await expect(turn.promise).resolves.toBeDefined();

    const tracePayloads = parseTraceJsonLines(await readTraceLines(traceFile));
    expect(
      tracePayloads.some(
        (payload) =>
          payload.id === 110 &&
          firstAnswer(getResult(payload), "approval") === "Approve this Session"
      )
    ).toBe(true);
    expect(
      tracePayloads.some(
        (payload) =>
          payload.id === 111 &&
          firstAnswer(getResult(payload), "freeform") ===
            "This is a non-interactive session. Operator input is unavailable."
      )
    ).toBe(true);
    expect(turn.messages.map((message) => message.event)).toContain(
      "approval_auto_approved"
    );
    expect(turn.messages.map((message) => message.event)).toContain(
      "tool_input_auto_answered"
    );
  });

  it("executes supported tool calls, normalizes tool output, and surfaces tool failures", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-tool-call-"));
    tempRoots.push(root);

    const traceFile = path.join(root, "tool-call.trace");
    const scenario = await createScenario({
      root,
      script: `#!/bin/sh
trace_file="${traceFile}"
count=0
while IFS= read -r line; do
  count=$((count + 1))
  printf 'JSON:%s\\n' "$line" >> "$trace_file"
  case "$count" in
    1)
      printf '%s\\n' '{"id":1,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-tool-call"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-tool-call"}}}'
      printf '%s\\n' '{"id":102,"method":"item/tool/call","params":{"name":"linear_graphql","arguments":{"query":"query Viewer { viewer { id } }","variables":{"includeTeams":false}}}}'
      ;;
    5)
      printf '%s\\n' '{"id":103,"method":"item/tool/call","params":{"tool":"linear_graphql","arguments":{"query":"query Viewer { viewer { id } }"}}}'
      ;;
    6)
      printf '%s\\n' '{"method":"turn/completed"}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    });

    const toolCalls: Array<{ toolName: string | null; argumentsPayload: unknown }> = [];
    const { session } = await startSessionForScenario(scenario);
    const turn = runTurnForScenario(scenario, session, {
      toolExecutor: async (toolName, argumentsPayload) => {
        toolCalls.push({
          toolName,
          argumentsPayload
        });

        if (toolCalls.length === 1) {
          return {
            success: true,
            contentItems: [
              {
                type: "inputText",
                text: `{"data":{"viewer":{"id":"usr_123"}}}`
              }
            ]
          };
        }

        return {
          success: false,
          contentItems: [
            {
              type: "inputText",
              text: `{"error":{"message":"boom"}}`
            }
          ]
        };
      }
    });
    await expect(turn.promise).resolves.toBeDefined();

    expect(toolCalls).toEqual([
      {
        toolName: "linear_graphql",
        argumentsPayload: {
          query: "query Viewer { viewer { id } }",
          variables: {
            includeTeams: false
          }
        }
      },
      {
        toolName: "linear_graphql",
        argumentsPayload: {
          query: "query Viewer { viewer { id } }"
        }
      }
    ]);

    const tracePayloads = parseTraceJsonLines(await readTraceLines(traceFile));
    expect(
      tracePayloads.some(
        (payload) =>
          payload.id === 102 &&
          getResult(payload)?.success === true &&
          getResult(payload)?.output === `{"data":{"viewer":{"id":"usr_123"}}}`
      )
    ).toBe(true);
    expect(
      tracePayloads.some(
        (payload) =>
          payload.id === 103 &&
          getResult(payload)?.success === false &&
          getResult(payload)?.output === `{"error":{"message":"boom"}}`
      )
    ).toBe(true);
    expect(turn.messages.map((message) => message.event)).toContain(
      "tool_call_completed"
    );
    expect(turn.messages.map((message) => message.event)).toContain(
      "tool_call_failed"
    );
  });

  it("buffers partial JSON lines until the newline terminator arrives", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-partial-"));
    tempRoots.push(root);

    const scenario = await createScenario({
      root,
      script: `#!/bin/sh
count=0
while IFS= read -r _line; do
  count=$((count + 1))
  case "$count" in
    1)
      padding=$(printf '%*s' 1100000 '' | tr ' ' a)
      printf '{"id":1,"result":{},"padding":"%s"}\\n' "$padding"
      ;;
    2)
      ;;
    3)
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-partial"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-partial"}}}'
      printf '%s\\n' '{"method":"turn/completed"}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    });

    const { session } = await startSessionForScenario(scenario);
    const turn = runTurnForScenario(scenario, session);
    await expect(turn.promise).resolves.toBeDefined();
  });

  it("logs stderr noise without surfacing malformed events and emits malformed for bad protocol lines", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-app-server-streams-"));
    tempRoots.push(root);

    const stderrScenario = await createScenario({
      root: path.join(root, "stderr"),
      script: `#!/bin/sh
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
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-stderr"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-stderr"}}}'
      printf '%s\\n' 'warning: this is stderr noise' >&2
      printf '%s\\n' '{"method":"turn/completed"}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    });

    const { session: stderrSession } = await startSessionForScenario(stderrScenario);
    const stderrTurn = runTurnForScenario(stderrScenario, stderrSession);
    await expect(stderrTurn.promise).resolves.toBeDefined();
    await waitForAsyncStreamDrain();
    expect(stderrTurn.messages.map((message) => message.event)).not.toContain(
      "malformed"
    );
    expect(
      stderrScenario.loggerSpy.warns.some((entry) =>
        entry.message.includes("Codex app-server stderr output") &&
        String(entry.context?.line).includes("warning: this is stderr noise")
      )
    ).toBe(true);

    const malformedScenario = await createScenario({
      root: path.join(root, "malformed"),
      script: `#!/bin/sh
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
      printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-malformed"}}}'
      ;;
    4)
      printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-malformed"}}}'
      printf '%s\\n' '{"method":"turn/completed"'
      printf '%s\\n' '{"method":"turn/completed"}'
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
done
`
    });

    const { session: malformedSession } = await startSessionForScenario(malformedScenario);
    const malformedTurn = runTurnForScenario(malformedScenario, malformedSession);
    await expect(malformedTurn.promise).resolves.toBeDefined();
    expect(malformedTurn.messages.map((message) => message.event)).toContain(
      "malformed"
    );
    expect(malformedTurn.messages.map((message) => message.event)).toContain(
      "turn_completed"
    );
  });
});

type TracePayload = Record<string, unknown> & {
  id?: number;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

type Scenario = {
  fakeCodex: string;
  issue: SymphonyTrackerIssue;
  loggerSpy: ReturnType<typeof createLoggerSpy>;
  root: string;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  workspacePath: string;
};

async function createScenario(input: {
  root: string;
  script: string;
  command?: string;
  issueOverrides?: Partial<SymphonyTrackerIssue>;
  workflowOverrides?: Partial<SymphonyResolvedWorkflowConfig>;
}): Promise<Scenario> {
  await mkdir(input.root, {
    recursive: true
  });

  const workspaceRoot = path.join(input.root, "workspaces");
  const workspacePath = path.join(workspaceRoot, "COL-123");
  const fakeCodex = path.join(input.root, "fake-codex.sh");

  await mkdir(workspacePath, {
    recursive: true
  });
  await writeExecutable(fakeCodex, input.script);
  const baseWorkflowConfig = buildSymphonyRuntimeWorkflowConfig(input.root);
  const overrides = input.workflowOverrides ?? {};

  return {
    root: input.root,
    fakeCodex,
    issue: buildSymphonyRuntimeTrackerIssue({
      state: "In Progress",
      ...input.issueOverrides
    }),
    loggerSpy: createLoggerSpy(),
    workflowConfig: buildSymphonyRuntimeWorkflowConfig(input.root, {
      ...overrides,
      tracker: {
        ...baseWorkflowConfig.tracker,
        ...overrides.tracker
      },
      polling: {
        ...baseWorkflowConfig.polling,
        ...overrides.polling
      },
      workspace: {
        ...baseWorkflowConfig.workspace,
        root: workspaceRoot,
        ...overrides.workspace
      },
      worker: {
        ...baseWorkflowConfig.worker,
        ...overrides.worker
      },
      agent: {
        ...baseWorkflowConfig.agent,
        ...overrides.agent
      },
      codex: {
        ...baseWorkflowConfig.codex,
        ...overrides.codex,
        command: input.command ?? `${fakeCodex} app-server`
      },
      hooks: {
        ...baseWorkflowConfig.hooks,
        ...overrides.hooks
      },
      observability: {
        ...baseWorkflowConfig.observability,
        ...overrides.observability
      },
      server: {
        ...baseWorkflowConfig.server,
        ...overrides.server
      },
      github: {
        ...baseWorkflowConfig.github,
        ...overrides.github
      }
    }),
    workspacePath
  };
}

async function startSessionForScenario(
  scenario: Scenario
): Promise<{
  session: CodexAppServerSession;
}> {
  const session = await CodexAppServerClient.startSession({
    launchTarget: buildHostLaunchTarget(scenario.workspacePath),
    env: defaultLaunchEnv(),
    hostCommandEnvSource: defaultHostCommandEnvSource(),
    workflowConfig: scenario.workflowConfig,
    issue: scenario.issue,
    logger: scenario.loggerSpy.logger
  });

  return {
    session
  };
}

function runTurnForScenario(
  scenario: Scenario,
  session: CodexAppServerSession,
  input: {
    toolExecutor?: (
      toolName: string | null,
      argumentsPayload: unknown
    ) => Promise<Record<string, unknown>>;
  } = {}
): {
  messages: Record<string, unknown>[];
  promise: Promise<unknown>;
} {
  const messages: Record<string, unknown>[] = [];
  const promise = session.client
    .runTurn(session, {
      prompt: "Handle the issue.",
      title: `${scenario.issue.identifier}: ${scenario.issue.title}`,
      sandboxPolicy: scenario.workflowConfig.codex.turnSandboxPolicy,
      turnTimeoutMs: 5_000,
      toolExecutor:
        input.toolExecutor ??
        (async (toolName) => ({
          success: toolName === "linear_graphql",
          output:
            toolName === "linear_graphql"
              ? '{"data":{"viewer":{"id":"usr_default"}}}'
              : `Unsupported dynamic tool: ${String(toolName)}`,
          contentItems: [
            {
              type: "inputText",
              text:
                toolName === "linear_graphql"
                  ? '{"data":{"viewer":{"id":"usr_default"}}}'
                  : `Unsupported dynamic tool: ${String(toolName)}`
            }
          ]
        })),
      onMessage(message) {
        messages.push(message);
      }
    })
    .finally(() => {
      session.client.close();
    });

  return {
    messages,
    promise
  };
}

function buildHostLaunchTarget(workspacePath: string) {
  return {
    kind: "host_path" as const,
    hostLaunchPath: workspacePath,
    hostWorkspacePath: workspacePath,
    runtimeWorkspacePath: workspacePath
  };
}

function buildContainerLaunchTarget(workspacePath: string) {
  return {
    kind: "container" as const,
    hostLaunchPath: workspacePath,
    hostWorkspacePath: workspacePath,
    runtimeWorkspacePath: "/home/agent/workspace",
    containerId: "container-123",
    containerName: "symphony-col-123-container",
    shell: "sh"
  };
}

function defaultLaunchEnv(): Record<string, string> {
  return {
    OPENAI_API_KEY: "test-openai-api-key"
  };
}

function defaultHostCommandEnvSource(): Record<string, string | undefined> {
  return process.env;
}

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content);
  await chmod(filePath, 0o755);
}

async function readTraceLines(traceFile: string): Promise<string[]> {
  const content = await readFile(traceFile, "utf8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function parseTraceJsonLines(
  lines: string[]
): TracePayload[] {
  return lines
    .filter((line) => line.startsWith("JSON:"))
    .map((line) => JSON.parse(line.slice("JSON:".length)) as TracePayload);
}

function createLoggerSpy() {
  const debugs: Array<{ message: string; context?: Record<string, unknown> }> = [];
  const warns: Array<{ message: string; context?: Record<string, unknown> }> = [];
  const errors: Array<{ message: string; context?: Record<string, unknown> }> = [];

  return {
    debugs,
    warns,
    errors,
    logger: {
      debug(message: string, context?: Record<string, unknown>) {
        debugs.push({
          message,
          context
        });
      },
      warn(message: string, context?: Record<string, unknown>) {
        warns.push({
          message,
          context
        });
      },
      error(message: string, context?: Record<string, unknown>) {
        errors.push({
          message,
          context
        });
      }
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function waitForAsyncStreamDrain(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
}

function getParams(payload: TracePayload | undefined): Record<string, unknown> | null {
  return asRecord(payload?.params);
}

function getResult(payload: TracePayload | undefined): Record<string, unknown> | null {
  return asRecord(payload?.result);
}

function firstAnswer(
  result: Record<string, unknown> | null,
  questionId: string
): string | null {
  const answers = asRecord(asRecord(result?.answers)?.[questionId]);
  const entries = Array.isArray(answers?.answers) ? answers.answers : [];
  const first = entries[0];
  return typeof first === "string" ? first : null;
}
