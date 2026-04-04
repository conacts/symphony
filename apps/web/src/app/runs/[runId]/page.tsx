import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";
import { RunTranscriptLiveScreen } from "@/components/run-transcript-live-screen";

export default async function RunDetailPage(input: {
  params: Promise<{
    runId: string;
  }>;
}) {
  const { runId } = await input.params;
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return <RunTranscriptLiveScreen model={model} runId={runId} />;
}
