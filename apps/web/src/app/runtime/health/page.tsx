import { RuntimeHealthLiveScreen } from "@/features/runtime/components/runtime-health-live-screen";
import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";

export default function RuntimeHealthPage() {
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return <RuntimeHealthLiveScreen model={model} />;
}
