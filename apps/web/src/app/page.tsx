import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";
import { RuntimeSummaryLiveScreen } from "@/components/runtime-summary-live-screen";

export default function Page() {
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return <RuntimeSummaryLiveScreen model={model} />;
}
