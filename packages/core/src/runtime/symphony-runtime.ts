import {
  SymphonyOrchestrator,
  type SymphonyOrchestratorConfig,
  type SymphonyAgentRuntimeCompletion,
  type SymphonyAgentRuntimeUpdate,
  type SymphonyClock,
  type SymphonyOrchestratorObserver,
  type SymphonyOrchestratorSnapshot
} from "@symphony/orchestrator";
import type {
  PublishReviewInput,
  PublishReviewResult,
  ReviewProvider,
  ReviewRequest,
  ReviewPublisher,
  ReviewResult
} from "@symphony/review";
import type { SymphonyTracker } from "@symphony/tracker";
import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";
import type { WorkspaceBackend } from "../workspace/workspace-backend.js";
import type { AgentRuntime } from "./agent-runtime.js";

export interface SymphonyRuntime<
  Request = ReviewRequest,
  Reviewed extends ReviewResult = ReviewResult,
  Published = PublishReviewResult
> {
  readonly workflowConfig: SymphonyResolvedWorkflowConfig;
  readonly tracker: SymphonyTracker;
  readonly workspaceBackend: WorkspaceBackend;
  readonly agentRuntime: AgentRuntime;
  readonly reviewProvider: ReviewProvider<Request, Reviewed> | null;
  readonly reviewPublisher: ReviewPublisher<
    PublishReviewInput<Reviewed>,
    Published
  > | null;
  snapshot(): SymphonyOrchestratorSnapshot;
  runPollCycle(): Promise<SymphonyOrchestratorSnapshot>;
  applyAgentUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void;
  handleRunCompletion(
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ): Promise<void>;
  publishReview(
    review: PublishReviewInput<Reviewed>
  ): Promise<PublishReviewResult<Published>>;
  runReview(input: Request): Promise<PublishReviewResult<Published> | null>;
  ingestReview(input: Request): Promise<PublishReviewResult<Published> | null>;
}

export function createSymphonyRuntime<
  Request = ReviewRequest,
  Reviewed extends ReviewResult = ReviewResult,
  Published = PublishReviewResult
>(input: {
  workflowConfig: SymphonyResolvedWorkflowConfig;
  tracker: SymphonyTracker;
  workspaceBackend: WorkspaceBackend;
  agentRuntime: AgentRuntime;
  reviewProvider?:
    | ReviewProvider<Request, Reviewed>
    | LegacyReviewProvider<Request, Reviewed>
    | null;
  reviewPublisher?:
    | ReviewPublisher<PublishReviewInput<Reviewed>, Published>
    | LegacyReviewPublisher<PublishReviewInput<Reviewed>, Published>
    | null;
  observer?: SymphonyOrchestratorObserver;
  clock?: SymphonyClock;
  runnerEnv?: Record<string, string | undefined>;
}): SymphonyRuntime<Request, Reviewed, Published> {
  const reviewProvider = normalizeReviewProvider(input.reviewProvider ?? null);
  const reviewPublisher = normalizeReviewPublisher(input.reviewPublisher ?? null);
  const orchestrator = new SymphonyOrchestrator({
    config: toSymphonyOrchestratorConfig(input.workflowConfig),
    tracker: input.tracker,
    workspaceBackend: input.workspaceBackend,
    agentRuntime: input.agentRuntime,
    observer: input.observer,
    clock: input.clock,
    runnerEnv: input.runnerEnv
  });
  const publishReview = async (
    review: PublishReviewInput<Reviewed>
  ): Promise<PublishReviewResult<Published>> =>
    await requireReviewPublisher(reviewPublisher).publishReview(review);
  const runReview = async (
    reviewRequest: Request
  ): Promise<PublishReviewResult<Published> | null> => {
    const resolvedReviewProvider = requireReviewProvider(reviewProvider);
    const review = await resolvedReviewProvider.review(reviewRequest);
    if (review === null) {
      return null;
    }

    return await publishReview(review);
  };

  return {
    workflowConfig: input.workflowConfig,
    tracker: input.tracker,
    workspaceBackend: input.workspaceBackend,
    agentRuntime: input.agentRuntime,
    reviewProvider,
    reviewPublisher,
    snapshot() {
      return orchestrator.snapshot();
    },
    async runPollCycle() {
      return await orchestrator.runPollCycle();
    },
    applyAgentUpdate(issueId, update) {
      orchestrator.applyAgentUpdate(issueId, update);
    },
    async handleRunCompletion(issueId, completion) {
      await orchestrator.handleRunCompletion(issueId, completion);
    },
    async publishReview(review) {
      return await publishReview(review);
    },
    async runReview(reviewInput) {
      return await runReview(reviewInput);
    },
    async ingestReview(reviewInput) {
      return await runReview(reviewInput);
    }
  };
}

type LegacyReviewProvider<Request, Reviewed extends ReviewResult> = {
  resolve(input: Request): Promise<Reviewed | null> | Reviewed | null;
};

type LegacyReviewPublisher<Input extends ReviewResult, Published> = {
  publish(input: Input): Promise<Published> | Published;
};

function normalizeReviewProvider<Request, Reviewed extends ReviewResult>(
  reviewProvider:
    | ReviewProvider<Request, Reviewed>
    | LegacyReviewProvider<Request, Reviewed>
    | null
): ReviewProvider<Request, Reviewed> | null {
  if (!reviewProvider) {
    return null;
  }

  if ("review" in reviewProvider) {
    return reviewProvider;
  }

  return {
    async review(input) {
      return await reviewProvider.resolve(input);
    }
  };
}

function normalizeReviewPublisher<Input extends ReviewResult, Published>(
  reviewPublisher:
    | ReviewPublisher<Input, Published>
    | LegacyReviewPublisher<Input, Published>
    | null
): ReviewPublisher<Input, Published> | null {
  if (!reviewPublisher) {
    return null;
  }

  if ("publishReview" in reviewPublisher) {
    return reviewPublisher;
  }

  return {
    async publishReview(input) {
      return await reviewPublisher.publish(input);
    }
  };
}

function requireReviewProvider<Request, Reviewed extends ReviewResult>(
  reviewProvider: ReviewProvider<Request, Reviewed> | null
): ReviewProvider<Request, Reviewed> {
  if (reviewProvider) {
    return reviewProvider;
  }

  throw new TypeError(
    "Symphony runtime is not configured with a ReviewProvider."
  );
}

function requireReviewPublisher<Input extends ReviewResult, Published>(
  reviewPublisher: ReviewPublisher<Input, Published> | null
): ReviewPublisher<Input, Published> {
  if (reviewPublisher) {
    return reviewPublisher;
  }

  throw new TypeError(
    "Symphony runtime is not configured with a ReviewPublisher."
  );
}

function toSymphonyOrchestratorConfig(
  workflowConfig: SymphonyResolvedWorkflowConfig
): SymphonyOrchestratorConfig {
  return {
    tracker: workflowConfig.tracker,
    polling: workflowConfig.polling,
    workspace: workflowConfig.workspace,
    hooks: workflowConfig.hooks,
    agent: {
      maxConcurrentAgents: workflowConfig.agent.maxConcurrentAgents,
      maxRetryBackoffMs: workflowConfig.agent.maxRetryBackoffMs,
      maxConcurrentAgentsByState:
        workflowConfig.agent.maxConcurrentAgentsByState
    },
    codex: {
      stallTimeoutMs: workflowConfig.codex.stallTimeoutMs
    },
    runtime: {
      tracker: workflowConfig.tracker,
      workspace: {
        root: workflowConfig.workspace.root
      },
      agent: {
        maxTurns: workflowConfig.agent.maxTurns
      },
      codex: {
        command: workflowConfig.codex.command,
        approvalPolicy: workflowConfig.codex.approvalPolicy,
        threadSandbox: workflowConfig.codex.threadSandbox,
        turnSandboxPolicy: workflowConfig.codex.turnSandboxPolicy,
        turnTimeoutMs: workflowConfig.codex.turnTimeoutMs,
        readTimeoutMs: workflowConfig.codex.readTimeoutMs
      },
      hooks: {
        timeoutMs: workflowConfig.hooks.timeoutMs
      }
    }
  };
}
