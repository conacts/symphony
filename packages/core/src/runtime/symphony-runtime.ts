import {
  SymphonyOrchestrator,
  type SymphonyAgentRuntimeCompletion,
  type SymphonyAgentRuntimeUpdate,
  type SymphonyClock,
  type SymphonyOrchestratorObserver,
  type SymphonyOrchestratorSnapshot
} from "../orchestration/symphony-orchestrator.js";
import type { ReviewProvider } from "../review/review-provider.js";
import type { ReviewPublisher } from "../review/review-publisher.js";
import type { SymphonyTracker } from "../tracker/symphony-tracker.js";
import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";
import type { WorkspaceBackend } from "../workspace/workspace-backend.js";
import type { AgentRuntime } from "./agent-runtime.js";

export interface SymphonyRuntime<
  ReviewInput = unknown,
  Review = unknown,
  ReviewResult = unknown
> {
  readonly workflowConfig: SymphonyResolvedWorkflowConfig;
  readonly tracker: SymphonyTracker;
  readonly workspaceBackend: WorkspaceBackend;
  readonly agentRuntime: AgentRuntime;
  readonly reviewProvider: ReviewProvider<ReviewInput, Review> | null;
  readonly reviewPublisher: ReviewPublisher<Review, ReviewResult> | null;
  snapshot(): SymphonyOrchestratorSnapshot;
  runPollCycle(): Promise<SymphonyOrchestratorSnapshot>;
  applyAgentUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void;
  handleRunCompletion(
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ): Promise<void>;
  publishReview(review: Review): Promise<ReviewResult>;
  ingestReview(input: ReviewInput): Promise<ReviewResult | null>;
}

export function createSymphonyRuntime<
  ReviewInput = unknown,
  Review = unknown,
  ReviewResult = unknown
>(input: {
  workflowConfig: SymphonyResolvedWorkflowConfig;
  tracker: SymphonyTracker;
  workspaceBackend: WorkspaceBackend;
  agentRuntime: AgentRuntime;
  reviewProvider?: ReviewProvider<ReviewInput, Review> | null;
  reviewPublisher?: ReviewPublisher<Review, ReviewResult> | null;
  observer?: SymphonyOrchestratorObserver;
  clock?: SymphonyClock;
  runnerEnv?: Record<string, string | undefined>;
}): SymphonyRuntime<ReviewInput, Review, ReviewResult> {
  const reviewProvider = input.reviewProvider ?? null;
  const reviewPublisher = input.reviewPublisher ?? null;
  const orchestrator = new SymphonyOrchestrator({
    workflowConfig: input.workflowConfig,
    tracker: input.tracker,
    workspaceBackend: input.workspaceBackend,
    agentRuntime: input.agentRuntime,
    observer: input.observer,
    clock: input.clock,
    runnerEnv: input.runnerEnv
  });

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
      return await requireReviewPublisher(reviewPublisher).publish(review);
    },
    async ingestReview(reviewInput) {
      const resolvedReviewProvider = requireReviewProvider(reviewProvider);
      const resolvedReviewPublisher = requireReviewPublisher(reviewPublisher);
      const review = await resolvedReviewProvider.resolve(reviewInput);
      if (review === null) {
        return null;
      }

      return await resolvedReviewPublisher.publish(review);
    }
  };
}

function requireReviewProvider<ReviewInput, Review>(
  reviewProvider: ReviewProvider<ReviewInput, Review> | null
): ReviewProvider<ReviewInput, Review> {
  if (reviewProvider) {
    return reviewProvider;
  }

  throw new TypeError(
    "Symphony runtime is not configured with a ReviewProvider."
  );
}

function requireReviewPublisher<Review, ReviewResult>(
  reviewPublisher: ReviewPublisher<Review, ReviewResult> | null
): ReviewPublisher<Review, ReviewResult> {
  if (reviewPublisher) {
    return reviewPublisher;
  }

  throw new TypeError(
    "Symphony runtime is not configured with a ReviewPublisher."
  );
}
