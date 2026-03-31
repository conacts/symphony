import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";
import { RunDetailLiveScreen } from "@/components/run-detail-live-screen";

export default async function RunDetailPage(input: {
  params: Promise<{
    runId: string;
  }>;
}) {
  const { runId } = await input.params;
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return <RunDetailLiveScreen model={model} runId={runId} />;
}
