import type { ReactElement } from "react";
import { RunTurnsLiveScreen } from "@/features/runs/components/run-turns-live-screen";

export default async function IssueRunTurnsPage(input: {
  params: Promise<{
    issueIdentifier: string;
    runId: string;
  }>;
}): Promise<ReactElement> {
  const { issueIdentifier: _trackerIssueKey, runId } = await input.params;

  return <RunTurnsLiveScreen runId={runId} />;
}
