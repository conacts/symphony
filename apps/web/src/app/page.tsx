import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";
import { OverviewLiveScreen } from "@/features/overview/components/overview-live-screen";

export default function Page() {
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return <OverviewLiveScreen model={model} />;
}
