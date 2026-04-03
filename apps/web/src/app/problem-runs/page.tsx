import { ProblemRunsLiveScreen } from "@/components/problem-runs-live-screen";
import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";

export default function ProblemRunsPage() {
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return <ProblemRunsLiveScreen model={model} />;
}
