import { randomUUID } from "node:crypto";
import type {
  HarnessCompletionCandidate,
  HarnessRuntimeUpdate,
  HarnessSession
} from "@symphony/agent-harnesses";
import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyAgentRuntimeConfig,
  SymphonyWorkerSessionContract
} from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type {
  AgentAnalyticsStore,
  SymphonyRuntimeRunStore
} from "@symphony/db";
import type { SymphonyLogger } from "@symphony/logger";
import type { RunCallbacks } from "./runtime-supervision-types.js";
import {
  buildSyntheticSessionStartedEvent,
  extractCanonicalSessionStartedEvent,
  extractRuntimeUsage,
  shouldSynthesizeSessionStartedEvent,
  summarizeCanonicalRuntimeEvent,
  type CanonicalRuntimeEventPayload
} from "./runtime-lifecycle-recorder.js";
import { completionFromHarnessCompletionCandidate } from "./runtime-outcome-classifier.js";
import {
  asJsonObject,
  asRecord,
  getString
} from "./runtime-supervision-values.js";
import { CommandResourceMonitor } from "../command-resource-monitor.js";

type RuntimeRunContextBase = Parameters<
  SymphonyRuntimeRunStore["upsertRunContext"]
>[1] extends infer T
  ? T extends { threadId: string }
    ? Omit<T, "threadId">
    : never
  : never;

export type RuntimeTurnProjectionState = {
  persistedEventSequence: number;
  recordedCanonicalSessionStart: boolean;
  latestCompletionCandidate: HarnessCompletionCandidate | null;
};

export type RuntimeTurnProjectionUpdateResult = {
  detectedCompletion: Extract<
    SymphonyAgentRuntimeCompletion,
    { kind: "delivered" | "awaiting_input" | "blocked" }
  > | null;
  recordedAt: string;
};

export type RuntimeTurnProjection = {
  state: RuntimeTurnProjectionState;
  recordSyntheticSessionStartedIfNeeded(): Promise<void>;
  handleUpdate(update: HarnessRuntimeUpdate): Promise<RuntimeTurnProjectionUpdateResult>;
  flushCommandProfiles(): Promise<void>;
};

export function createRuntimeTurnProjection(input: {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  attempt: number;
  runMode: SymphonyRunMode;
  persistedTurnId: string | null;
  session: HarnessSession;
  runtimePolicy: SymphonyAgentRuntimeConfig;
  runtimeContextBase: RuntimeRunContextBase;
  runStore: SymphonyRuntimeRunStore;
  agentAnalytics: AgentAnalyticsStore;
  workerSessionContract: SymphonyWorkerSessionContract;
  callbacks: RunCallbacks;
  commandResourceMonitor: CommandResourceMonitor | null;
  logger: SymphonyLogger;
  initialState?: Partial<
    Pick<RuntimeTurnProjectionState, "recordedCanonicalSessionStart" | "latestCompletionCandidate">
  >;
}): RuntimeTurnProjection {
  const state: RuntimeTurnProjectionState = {
    persistedEventSequence: 0,
    recordedCanonicalSessionStart:
      input.initialState?.recordedCanonicalSessionStart ?? false,
    latestCompletionCandidate:
      input.initialState?.latestCompletionCandidate ?? null
  };

  const nextPersistedEventMetadata = () => ({
    eventId: randomUUID(),
    eventSequence: (state.persistedEventSequence += 1)
  });

  return {
    state,
    async recordSyntheticSessionStartedIfNeeded() {
      if (
        !input.runId ||
        !input.persistedTurnId ||
        state.recordedCanonicalSessionStart ||
        !shouldSynthesizeSessionStartedEvent(input.runtimePolicy)
      ) {
        return;
      }

      const sessionStartedEvent = buildSyntheticSessionStartedEvent({
        threadId: input.session.threadId,
        persistedTurnId: input.persistedTurnId,
        processId: input.session.processId,
        model: input.session.model,
        reasoningEffort: input.session.reasoningEffort
      });

      if (!sessionStartedEvent) {
        return;
      }

      await input.runStore.recordEvent(input.runId, input.persistedTurnId, {
        ...nextPersistedEventMetadata(),
        eventType: sessionStartedEvent.type,
        recordedAt: new Date().toISOString(),
        payload: sessionStartedEvent,
        summary: summarizeCanonicalRuntimeEvent(sessionStartedEvent),
        threadId: sessionStartedEvent.thread_id ?? input.session.threadId
      });
      await input.runStore.upsertRunContext(input.runId, {
        ...input.runtimeContextBase,
        threadId: sessionStartedEvent.thread_id ?? input.session.threadId,
        processId: sessionStartedEvent.agent_app_server_pid ?? input.session.processId,
        model: sessionStartedEvent.model ?? input.session.model,
        reasoningEffort:
          sessionStartedEvent.reasoning_effort ?? input.session.reasoningEffort
      });
      state.recordedCanonicalSessionStart = true;
    },

    async handleUpdate(update: HarnessRuntimeUpdate) {
      const { event: threadEvent, rawPayload } = update;
      const runtimePayload = rawPayload ?? threadEvent;
      const runtimePayloadRecord = asRecord(runtimePayload);
      const sessionStartedEvent =
        extractCanonicalSessionStartedEvent(runtimePayloadRecord);
      const recordedAt = new Date().toISOString();
      const turnUsage = extractRuntimeUsage(threadEvent, runtimePayloadRecord);
      const threadId =
        (threadEvent.type === "thread.started" ? threadEvent.thread_id : null) ??
        getString(runtimePayloadRecord, "thread_id") ??
        input.session.threadId;
      const canonicalEvent =
        (threadEvent as CanonicalRuntimeEventPayload) ?? sessionStartedEvent;

      if (update.completionCandidate) {
        state.latestCompletionCandidate = update.completionCandidate;
      }

      await input.callbacks.onUpdate(input.issue.id, {
        event: threadEvent.type,
        payload: runtimePayload,
        timestamp: recordedAt,
        threadId: sessionStartedEvent?.thread_id ?? threadId,
        agentRuntimeProcessId:
          getString(runtimePayloadRecord, "agent_app_server_pid") ??
          input.session.processId
      });

      await input.workerSessionContract.recordObservation({
        sessionId: input.session.threadId,
        issueId: input.issue.id,
        runId: input.runId,
        attempt: input.attempt,
        runMode: input.runMode,
        recordedAt,
        eventType: threadEvent.type,
        payload: asJsonObject(runtimePayload)
      });

      if (input.runId && input.persistedTurnId) {
        if (turnUsage) {
          await input.runStore.updateTurn(input.persistedTurnId, {
            usage: turnUsage
          });
        }

        if (canonicalEvent) {
          await input.runStore.recordEvent(input.runId, input.persistedTurnId, {
            ...nextPersistedEventMetadata(),
            eventType: canonicalEvent.type,
            recordedAt,
            payload: canonicalEvent,
            summary: summarizeCanonicalRuntimeEvent(canonicalEvent),
            threadId:
              (canonicalEvent.type === "session.started"
                ? canonicalEvent.thread_id
                : threadId) ?? input.session.threadId,
            agentTurnId:
              canonicalEvent.type === "session.started"
                ? canonicalEvent.turn_id
                : getString(runtimePayloadRecord, "turn_id") ?? null
          });

          if (canonicalEvent.type === "session.started") {
            await input.runStore.upsertRunContext(input.runId, {
              ...input.runtimeContextBase,
              threadId: canonicalEvent.thread_id ?? input.session.threadId,
              processId:
                canonicalEvent.agent_app_server_pid ?? input.session.processId,
              model: canonicalEvent.model ?? input.session.model,
              reasoningEffort:
                canonicalEvent.reasoning_effort ?? input.session.reasoningEffort
            });
            state.recordedCanonicalSessionStart = true;
          }
        }

        await input.agentAnalytics.recordEvent({
          runId: input.runId,
          turnId: input.persistedTurnId,
          threadId,
          recordedAt,
          payload: threadEvent,
          rawPayload
        });

        if (input.commandResourceMonitor) {
          try {
            const completedProfiles =
              await input.commandResourceMonitor.observe(threadEvent, recordedAt);
            for (const profile of completedProfiles) {
              await input.agentAnalytics.recordCommandResourceProfile({
                runId: input.runId,
                turnId: input.persistedTurnId,
                itemId: profile.itemId,
                resourceProfile: profile.profile
              });
            }
          } catch (monitorError) {
            input.logger.warn("Failed to record command resource metrics", {
              runId: input.runId,
              turnId: input.persistedTurnId,
              error:
                monitorError instanceof Error
                  ? monitorError.message
                  : String(monitorError)
            });
          }
        }
      }

      const detectedCompletion =
        threadEvent.type === "item.completed" &&
        threadEvent.item.type === "agent_message"
          ? completionFromHarnessCompletionCandidate(
              update.completionCandidate ?? null
            )
          : null;

      return {
        detectedCompletion,
        recordedAt
      };
    },

    async flushCommandProfiles() {
      if (
        !input.commandResourceMonitor ||
        !input.runId ||
        !input.persistedTurnId
      ) {
        return;
      }

      try {
        const flushedProfiles = await input.commandResourceMonitor.flush();
        for (const profile of flushedProfiles) {
          await input.agentAnalytics.recordCommandResourceProfile({
            runId: input.runId,
            turnId: input.persistedTurnId,
            itemId: profile.itemId,
            resourceProfile: profile.profile
          });
        }
      } catch (monitorError) {
        input.logger.warn("Failed to flush command resource metrics", {
          runId: input.runId,
          turnId: input.persistedTurnId,
          error:
            monitorError instanceof Error
              ? monitorError.message
              : String(monitorError)
        });
      }
    }
  };
}
