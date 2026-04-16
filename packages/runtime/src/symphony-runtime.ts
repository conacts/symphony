import {
  SymphonyOrchestrator,
  type AgentRuntime,
  type SymphonyOrchestratorConfig,
  type SymphonyAgentRuntimeCompletion,
  type SymphonyAgentRuntimeUpdate,
  type SymphonyClock,
  type SymphonyOrchestratorObserver,
  type SymphonyWorkflowRoutingAdapter,
  type SymphonyOrchestratorSnapshot
} from "@symphony/orchestrator";
import {
  type SymphonyResolvedRuntimePolicy
} from "@symphony/runtime-policy";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { WorkspaceBackend } from "@symphony/workspace";

export interface SymphonyRuntime {
  readonly runtimePolicy: SymphonyResolvedRuntimePolicy;
  readonly tracker: SymphonyTracker;
  readonly workspaceBackend: WorkspaceBackend;
  readonly agentRuntime: AgentRuntime;
  snapshot(): SymphonyOrchestratorSnapshot;
  runPollCycle(): Promise<SymphonyOrchestratorSnapshot>;
  shouldDispatchIssue(issue: SymphonyTrackerIssue): boolean;
  dispatchIssue(
    issue: SymphonyTrackerIssue,
    attempt: number,
    preferredWorkerHost?: string | null,
    runModeOverride?: SymphonyRunMode
  ): Promise<void>;
  applyAgentUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void;
  handleRunCompletion(
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ): Promise<void>;
  shutdownActiveRuns(reason: string): Promise<number>;
}

export function createSymphonyRuntime(input: {
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  tracker: SymphonyTracker;
  workspaceBackend: WorkspaceBackend;
  agentRuntime: AgentRuntime;
  observer?: SymphonyOrchestratorObserver;
  clock?: SymphonyClock;
  runnerEnv?: Record<string, string | undefined>;
  workflowRoutingAdapter: SymphonyWorkflowRoutingAdapter;
}): SymphonyRuntime {
  assertLifecycleRoutingConfigured(input);
  const orchestrator = new SymphonyOrchestrator({
    config: toSymphonyOrchestratorConfig(input.runtimePolicy),
    tracker: input.tracker,
    workspaceBackend: input.workspaceBackend,
    agentRuntime: input.agentRuntime,
    observer: input.observer,
    clock: input.clock,
    runnerEnv: input.runnerEnv,
    workflowRoutingAdapter: input.workflowRoutingAdapter
  });

  return {
    runtimePolicy: input.runtimePolicy,
    tracker: input.tracker,
    workspaceBackend: input.workspaceBackend,
    agentRuntime: input.agentRuntime,
    snapshot() {
      return orchestrator.snapshot();
    },
    async runPollCycle() {
      return await orchestrator.runPollCycle();
    },
    shouldDispatchIssue(issue) {
      return orchestrator.shouldDispatchIssue(issue);
    },
    async dispatchIssue(issue, attempt, preferredWorkerHost = null, runModeOverride) {
      await orchestrator.dispatchIssue(
        issue,
        attempt,
        preferredWorkerHost,
        runModeOverride
      );
    },
    applyAgentUpdate(issueId, update) {
      orchestrator.applyAgentUpdate(issueId, update);
    },
    async handleRunCompletion(issueId, completion) {
      await orchestrator.handleRunCompletion(issueId, completion);
    },
    async shutdownActiveRuns(reason) {
      return await orchestrator.shutdownActiveRuns(reason);
    }
  };
}

function assertLifecycleRoutingConfigured(input: {
  workflowRoutingAdapter: SymphonyWorkflowRoutingAdapter | null | undefined;
}): asserts input is {
  workflowRoutingAdapter: SymphonyWorkflowRoutingAdapter;
} {
  if (!input.workflowRoutingAdapter) {
    throw new TypeError(
      "Symphony runtime requires a workflow routing adapter."
    );
  }
}

function toSymphonyOrchestratorConfig(
  runtimePolicy: SymphonyResolvedRuntimePolicy
): SymphonyOrchestratorConfig {
  assertPiRuntimeHarness(runtimePolicy.agent.harness);

  return {
    tracker: runtimePolicy.tracker,
    polling: runtimePolicy.polling,
    workspace: runtimePolicy.workspace,
    hooks: runtimePolicy.hooks,
    agent: {
      maxConcurrentAgents: runtimePolicy.agent.maxConcurrentAgents,
      maxRetryBackoffMs: runtimePolicy.agent.maxRetryBackoffMs,
      maxConcurrentAgentsByState:
        runtimePolicy.agent.maxConcurrentAgentsByState
    },
    agentRuntime: {
      stallTimeoutMs: runtimePolicy.agentRuntime.stallTimeoutMs
    },
    runtime: {
      tracker: runtimePolicy.tracker,
      workspace: {
        root: runtimePolicy.workspace.root
      },
      agent: {
        harness: runtimePolicy.agent.harness,
        maxTurns: runtimePolicy.agent.maxTurns
      },
      pi: {
        profile: runtimePolicy.pi.profile,
        defaultModel: runtimePolicy.pi.defaultModel,
        defaultReasoningEffort: runtimePolicy.pi.defaultReasoningEffort,
        defaultPreset: runtimePolicy.pi.defaultPreset,
        presets: runtimePolicy.pi.presets,
        provider: runtimePolicy.pi.provider,
        turnTimeoutMs: runtimePolicy.pi.turnTimeoutMs,
        readTimeoutMs: runtimePolicy.pi.readTimeoutMs,
        stallTimeoutMs: runtimePolicy.pi.stallTimeoutMs,
        toolTimeoutMs: runtimePolicy.pi.toolTimeoutMs
      },
      agentRuntime: {
        command: runtimePolicy.agentRuntime.command,
        approvalPolicy: runtimePolicy.agentRuntime.approvalPolicy,
        threadSandbox: runtimePolicy.agentRuntime.threadSandbox,
        turnSandboxPolicy: runtimePolicy.agentRuntime.turnSandboxPolicy,
        profile: runtimePolicy.agentRuntime.profile,
        defaultModel: runtimePolicy.agentRuntime.defaultModel,
        defaultReasoningEffort: runtimePolicy.agentRuntime.defaultReasoningEffort,
        defaultPreset: runtimePolicy.agentRuntime.defaultPreset,
        presets: runtimePolicy.agentRuntime.presets,
        provider: runtimePolicy.agentRuntime.provider,
        turnTimeoutMs: runtimePolicy.agentRuntime.turnTimeoutMs,
        readTimeoutMs: runtimePolicy.agentRuntime.readTimeoutMs,
        stallTimeoutMs: runtimePolicy.agentRuntime.stallTimeoutMs
      },
      hooks: {
        timeoutMs: runtimePolicy.hooks.timeoutMs
      }
    }
  };
}

function assertPiRuntimeHarness(
  harness: "pi"
): asserts harness is "pi" {
  void harness;
}
