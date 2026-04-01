import { ControlPlaneShell } from "@/components/control-plane-shell";
import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";

export default function Page() {
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return <ControlPlaneShell model={model} />;
}
