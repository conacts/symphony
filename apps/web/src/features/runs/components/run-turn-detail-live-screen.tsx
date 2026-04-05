"use client";

import React, { useMemo, useState } from "react";
import { fetchAgentOverflow } from "@/core/agent-analytics-client";
import {
  buildIssueRunTurnBreadcrumbRoutes
} from "@/core/control-plane-routes";
import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import { RunOverflowSheet } from "@/features/runs/components/run-overflow-sheet";
import { RunTurnDetailView } from "@/features/runs/components/run-turn-detail-view";
import { type AgentRunTranscriptEntry, formatOverflowContent } from "@/features/runs/model/agent-run-view-model";
import { useAgentRun } from "@/features/runs/hooks/use-agent-run";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";

type OverflowState = {
  title: string;
  description: string;
  content: string | null;
  loading: boolean;
  error: string | null;
};

const closedOverflowState: OverflowState = {
  title: "",
  description: "",
  content: null,
  loading: false,
  error: null
};

export function RunTurnDetailLiveScreen(input: {
  runId: string;
  turnId: string;
}) {
  const model = useControlPlaneModel();
  const runState = useAgentRun({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    runId: input.runId
  });
  const connection = useMemo(
    () =>
      buildRuntimeSummaryConnectionState({
        status: runState.status,
        error: runState.error,
        hasSnapshot: runState.resource !== null
      }),
    [runState.error, runState.resource, runState.status]
  );
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowState, setOverflowState] = useState<OverflowState>(
    closedOverflowState
  );

  const openOverflow = async (entry: AgentRunTranscriptEntry) => {
    if (!runState.resource || !entry.overflowId) {
      return;
    }

    setOverflowOpen(true);
    setOverflowState({
      title: buildOverflowTitle(entry),
      description: entry.recordedAt,
      content: null,
      loading: true,
      error: null
    });

    try {
      const overflow = await fetchAgentOverflow(
        model.runtimeBaseUrl,
        runState.resource.runDetail.run.runId,
        entry.overflowId
      );

      setOverflowState({
        title: buildOverflowTitle(entry),
        description: `${entry.recordedAt} · ${overflow.overflow.kind}`,
        content: formatOverflowContent(overflow),
        loading: false,
        error: null
      });
    } catch (error) {
      setOverflowState({
        title: buildOverflowTitle(entry),
        description: `${entry.recordedAt} · overflow`,
        content: null,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load the overflow payload."
      });
    }
  };

  return (
    <ControlPlanePage
      connection={connection}
      breadcrumbs={
        runState.resource
          ? buildIssueRunTurnBreadcrumbRoutes(
              runState.resource.runDetail.issue.issueIdentifier,
              runState.resource.runDetail.run.runId,
              input.turnId
            )
          : []
      }
    >
      <RunTurnDetailView
        error={runState.error}
        loading={runState.loading}
        resource={runState.resource}
        turnId={input.turnId}
        onOpenOverflow={openOverflow}
      />
      <RunOverflowSheet
        open={overflowOpen}
        onOpenChange={(open) => {
          setOverflowOpen(open);
          if (!open) {
            setOverflowState(closedOverflowState);
          }
        }}
        title={overflowState.title}
        description={overflowState.description}
        content={overflowState.content}
        loading={overflowState.loading}
        error={overflowState.error}
      />
    </ControlPlanePage>
  );
}

function buildOverflowTitle(entry: AgentRunTranscriptEntry): string {
  switch (entry.kind) {
    case "agent-message":
      return "Assistant message";
    case "reasoning":
      return "Reasoning";
    case "pi-read-task":
      return "PI read result";
    case "pi-edit-task":
      return "PI edit result";
    case "pi-write-task":
      return "PI write result";
    case "pi-grep-task":
      return "PI grep result";
    case "pi-find-task":
      return "PI find result";
    case "command":
      return "Command output";
    case "tool-call":
      return "Tool result";
    case "todo-list":
      return "Todo list";
    case "generic":
      return entry.itemType;
  }
}
