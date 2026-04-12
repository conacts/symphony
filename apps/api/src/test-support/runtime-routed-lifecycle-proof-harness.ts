import {
  createSqliteSymphonyRuntimeRunStore,
  initializeSymphonyDb,
  type SymphonyRuntimeRunStore
} from "@symphony/db";
import type { RuntimeToolExecutionResult } from "@symphony/runtime-tools";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import { buildSymphonyTrackerIssue } from "@symphony/test-support";
import {
  type MemorySymphonyTracker,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeAppServices } from "../core/runtime-app-types.js";
import { createRuntimeRunLifecycleRouter } from "../core/runtime-run-lifecycle-routing.js";
import { createRuntimeRunStartActivationRouter } from "../core/runtime-run-start-activation-routing.js";
import { loadDefaultSymphonyRuntimeAppServices } from "../core/runtime-services.js";
import { createRuntimeWorkflowSessionLoader } from "../core/runtime-workflow-session-loader.js";
import {
  createSymphonyRuntimeAppServicesHarness,
  type SymphonyRuntimeAppServicesHarness
} from "./create-symphony-runtime-app-services-harness.js";

type RoutedDispatchRequest = Parameters<
  SymphonyRuntimeAppServices["orchestrator"]["dispatchRoutedIssue"]
>[0];

type ObserveNonRunningIssueResult = Awaited<
  ReturnType<SymphonyRuntimeAppServices["trackerStateIngress"]["observeNonRunningIssue"]>
>;

type RuntimeRunStartActivationRouter = Awaited<
  ReturnType<typeof createRuntimeRunStartActivationRouter>
>;

type RuntimeRunLifecycleRouter = Awaited<
  ReturnType<typeof createRuntimeRunLifecycleRouter>
>;

export class RuntimeRoutedLifecycleProofHarness {
  static async create(input: {
    issueId: string;
    issueIdentifier: string;
    trackerState: string;
  }): Promise<RuntimeRoutedLifecycleProofHarness> {
    const appHarness = await createSymphonyRuntimeAppServicesHarness();
    const issue = buildSymphonyTrackerIssue({
      id: input.issueId,
      identifier: input.issueIdentifier,
      state: input.trackerState
    });
    const harness = new RuntimeRoutedLifecycleProofHarness({
      appHarness,
      issue
    });
    await harness.initialize();
    return harness;
  }

  readonly #appHarness: SymphonyRuntimeAppServicesHarness;
  readonly #issueSeed: SymphonyTrackerIssue;
  readonly #database: ReturnType<typeof initializeSymphonyDb>;
  readonly #runStore: SymphonyRuntimeRunStore;
  #services: SymphonyRuntimeAppServices;
  #runStartActivationRouter: RuntimeRunStartActivationRouter | null = null;
  #runLifecycleRouter: RuntimeRunLifecycleRouter | null = null;
  #dispatchQueue: RoutedDispatchRequest[] = [];

  private constructor(input: {
    appHarness: SymphonyRuntimeAppServicesHarness;
    issue: SymphonyTrackerIssue;
  }) {
    this.#appHarness = input.appHarness;
    this.#issueSeed = cloneIssue(input.issue);
    this.#services = input.appHarness.services;
    this.#database = initializeSymphonyDb({
      dbFile: input.appHarness.env.dbFile
    });
    this.#runStore = createSqliteSymphonyRuntimeRunStore({
      db: this.#database.db
    });
  }

  get issueIdentifier(): string {
    return this.#issueSeed.identifier;
  }

  get issueId(): string {
    return this.#issueSeed.id;
  }

  get services(): SymphonyRuntimeAppServices {
    return this.#services;
  }

  async cleanup(): Promise<void> {
    if (this.#services !== this.#appHarness.services) {
      await this.#services.shutdown();
    }
    this.#database.close();
    await this.#appHarness.cleanup();
  }

  async restart(input: {
    trackerState?: string;
  } = {}): Promise<void> {
    const currentIssue = this.currentIssue();
    const restartedServices = await this.reloadServices();

    this.#services = restartedServices;
    this.#dispatchQueue = [];
    this.memoryTracker().setIssues([
      {
        ...currentIssue,
        state: input.trackerState ?? currentIssue.state
      }
    ]);
    await this.rebuildRoutingSeams();
    this.installDispatchCapture();
  }

  currentIssue(): SymphonyTrackerIssue {
    const issue = this.memoryTracker().getIssue(this.#issueSeed.id);
    if (!issue) {
      throw new TypeError(
        `Tracker issue ${this.#issueSeed.identifier} is missing from the proof harness.`
      );
    }
    return issue;
  }

  async setTrackerState(state: string): Promise<void> {
    await this.memoryTracker().updateIssueState(this.#issueSeed.id, state);
  }

  queuedDispatches(): RoutedDispatchRequest[] {
    return this.#dispatchQueue.map(cloneDispatchRequest);
  }

  clearDispatchQueue(): void {
    this.#dispatchQueue = [];
  }

  async observeNonRunningIssue(): Promise<ObserveNonRunningIssueResult> {
    return await this.#services.trackerStateIngress.observeNonRunningIssue({
      issueIdentifier: this.#issueSeed.identifier
    });
  }

  async activateNextDispatch(input: {
    runId: string;
    recordedAt: string;
    threadId?: string;
  }): Promise<SymphonyTrackerIssue> {
    const request = this.takeNextDispatch();
    const router = this.requiredRunStartActivationRouter();
    const activated = await router.activate({
      issue: request.issue,
      runId: input.runId,
      runMode: request.runMode,
      threadId: input.threadId ?? `thread-${input.runId}`,
      workerHost: null,
      launchTarget: null,
      recordedAt: input.recordedAt
    });
    await this.#runStore.recordRunStarted({
      repositoryKey: this.requireRepositoryKey(),
      trackerIssueId: activated.issue.id,
      issueIdentifier: activated.issue.identifier,
      runId: input.runId,
      runMode: request.runMode,
      status: "running",
      startedAt: input.recordedAt,
      metadata: {
        source: "runtime_routed_lifecycle_proof_harness"
      }
    });

    return activated.issue;
  }

  async recordDeliveryReport(input: {
    runId: string;
    status?: "completed" | "blocked" | "partial";
    summary: string;
    prUrl?: string | null;
    blockingReason?: string | null;
    testsSummary?: string | null;
  }): Promise<RuntimeToolExecutionResult> {
    const issue = this.currentIssue();
    const result = await this.#services.runtimeTools.recordDeliveryReport({
      runId: input.runId,
      turnId: null,
      issue: {
        trackerIssueId: issue.id,
        identifier: issue.identifier
      },
      argumentsPayload: {
        status: input.status ?? "completed",
        summary: input.summary,
        prUrl: input.prUrl ?? null,
        blockingReason: input.blockingReason ?? null,
        testsSummary: input.testsSummary ?? null
      }
    });

    if (result.success) {
      await this.finalizeRun({
        runId: input.runId,
        status:
          input.status === "blocked"
            ? "finished"
            : input.status === "partial"
              ? "running"
              : "finished",
        outcome:
          input.status === "blocked"
            ? "blocked"
            : input.status === "completed"
              ? "completed"
              : null
      });
    }

    return result;
  }

  async submitSpikeResult(input: {
    runId: string;
    summary: string;
    details: string;
    targetState: "Paused" | "Blocked";
  }): Promise<RuntimeToolExecutionResult> {
    const issue = this.currentIssue();
    const result = await this.#services.runtimeTools.submitSpikeResult({
      runId: input.runId,
      turnId: null,
      issue: {
        trackerIssueId: issue.id,
        identifier: issue.identifier
      },
      argumentsPayload: {
        summary: input.summary,
        details: input.details,
        state: input.targetState
      }
    });

    if (result.success) {
      await this.finalizeRun({
        runId: input.runId,
        status: input.targetState === "Paused" ? "paused" : "finished",
        outcome: input.targetState === "Blocked" ? "blocked" : null
      });
    }

    return result;
  }

  async submitMergeResult(input: {
    runId: string;
    status: "merged" | "blocked";
    summary: string;
    prUrl?: string | null;
    mergeCommitSha?: string | null;
    blockingReason?: string | null;
    testsSummary?: string | null;
  }): Promise<RuntimeToolExecutionResult> {
    const issue = this.currentIssue();
    const result = await this.#services.runtimeTools.submitMergeResult({
      runId: input.runId,
      turnId: null,
      issue: {
        trackerIssueId: issue.id,
        identifier: issue.identifier
      },
      argumentsPayload: {
        status: input.status,
        summary: input.summary,
        prUrl: input.prUrl ?? null,
        mergeCommitSha: input.mergeCommitSha ?? null,
        blockingReason: input.blockingReason ?? null,
        testsSummary: input.testsSummary ?? null
      }
    });

    if (result.success) {
      await this.finalizeRun({
        runId: input.runId,
        status: "finished",
        outcome: input.status === "merged" ? "merged" : "merge_blocked"
      });
    }

    return result;
  }

  async routeStartupFailure(input: {
    runId: string;
    recordedAt: string;
    reason: string;
    runMode?: SymphonyRunMode;
  }): Promise<SymphonyTrackerIssue> {
    const router = this.requiredRunLifecycleRouter();
    const completion = await router.routeCompletion({
      issue: this.currentIssue(),
      runId: input.runId,
      runMode: input.runMode ?? "implementation",
      completion: {
        kind: "startup_failure",
        reason: input.reason,
        failureStage: "runtime_session_start",
        failureOrigin: "workspace_lifecycle"
      },
      recordedAt: input.recordedAt
    });

    return completion.issue;
  }

  async loadLifecycleView(input: {
    runId?: string | null;
  } = {}) {
    const lifecycle = await this.#services.workflowRead.loadWorkflowLifecycleView({
      issueIdentifier: this.#issueSeed.identifier,
      runId: input.runId ?? null
    });
    if (!lifecycle) {
      throw new TypeError(
        `Workflow lifecycle view is missing for ${this.#issueSeed.identifier}.`
      );
    }
    return lifecycle;
  }

  async initialize(): Promise<void> {
    this.memoryTracker().setIssues([this.#issueSeed]);
    await this.rebuildRoutingSeams();
    this.installDispatchCapture();
  }

  private async rebuildRoutingSeams(): Promise<void> {
    const sessionLoader = await createRuntimeWorkflowSessionLoader({
      routeWorkflows: this.#services.routeWorkflows,
      trackerConfig: this.#services.runtimePolicy.tracker
    });

    this.#runStartActivationRouter = await createRuntimeRunStartActivationRouter({
      routeWorkflows: this.#services.routeWorkflows,
      tracker: this.#services.tracker,
      sessionLoader
    });
    this.#runLifecycleRouter = await createRuntimeRunLifecycleRouter({
      routeWorkflows: this.#services.routeWorkflows,
      tracker: this.#services.tracker,
      sessionLoader
    });
  }

  private installDispatchCapture(): void {
    this.#services.orchestrator.dispatchRoutedIssue = async (input) => {
      this.#dispatchQueue.push(cloneDispatchRequest(input));
    };
  }

  private requiredRunStartActivationRouter(): RuntimeRunStartActivationRouter {
    if (!this.#runStartActivationRouter) {
      throw new TypeError("Run-start activation router is not initialized.");
    }
    return this.#runStartActivationRouter;
  }

  private requiredRunLifecycleRouter(): RuntimeRunLifecycleRouter {
    if (!this.#runLifecycleRouter) {
      throw new TypeError("Run-lifecycle router is not initialized.");
    }
    return this.#runLifecycleRouter;
  }

  private memoryTracker(): MemorySymphonyTracker {
    const { tracker } = this.#services;
    if (!isMemorySymphonyTracker(tracker)) {
      throw new TypeError(
        "Runtime routed lifecycle proof harness requires MemorySymphonyTracker."
      );
    }
    return tracker;
  }

  private takeNextDispatch(): RoutedDispatchRequest {
    const request = this.#dispatchQueue.shift();
    if (!request) {
      throw new TypeError(
        `Expected a queued routed dispatch for ${this.#issueSeed.identifier}.`
      );
    }
    return cloneDispatchRequest(request);
  }

  private async reloadServices(): Promise<SymphonyRuntimeAppServices> {
    await this.#services.shutdown();
    return await loadDefaultSymphonyRuntimeAppServices(
      this.#appHarness.env,
      this.#appHarness.environmentSource,
      this.#appHarness.hostCommandEnvSource,
      {
        startPollScheduler: false,
        startMachineLoadMonitor: false,
        enableDockerPreflight: false
      }
    );
  }

  private async finalizeRun(input: {
    runId: string;
    status:
      | "running"
      | "finished"
      | "paused";
    outcome:
      | "completed"
      | "merged"
      | "blocked"
      | "merge_blocked"
      | null;
  }): Promise<void> {
    if (input.status === "running") {
      return;
    }

    await this.#runStore.finalizeRun(input.runId, {
      status: input.status,
      outcome: input.outcome,
      endedAt: new Date().toISOString()
    });
  }

  private requireRepositoryKey(): string {
    const repositoryKey = this.#services.runtimePolicy.github.repo;
    if (!repositoryKey) {
      throw new TypeError(
        "Runtime routed lifecycle proof harness requires runtimePolicy.github.repo."
      );
    }
    return repositoryKey;
  }
}

function cloneDispatchRequest(input: RoutedDispatchRequest): RoutedDispatchRequest {
  return {
    ...input,
    issue: cloneIssue(input.issue)
  };
}

function cloneIssue(issue: SymphonyTrackerIssue): SymphonyTrackerIssue {
  return {
    ...issue,
    blockedBy: [...issue.blockedBy],
    labels: [...issue.labels]
  };
}

function isMemorySymphonyTracker(
  tracker: SymphonyRuntimeAppServices["tracker"]
): tracker is MemorySymphonyTracker {
  return (
    typeof tracker === "object" &&
    tracker !== null &&
    "setIssues" in tracker &&
    typeof tracker.setIssues === "function" &&
    "getIssue" in tracker &&
    typeof tracker.getIssue === "function"
  );
}
