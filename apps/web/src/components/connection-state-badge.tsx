import { Badge } from "@/components/ui/badge";
import type { SymphonyDashboardConnectionKind } from "@/core/dashboard-foundation";

const variantByConnectionKind: Record<
  SymphonyDashboardConnectionKind,
  "default" | "destructive"
> = {
  waiting: "destructive",
  connected: "default",
  degraded: "destructive"
};

export function ConnectionStateBadge(input: {
  kind: SymphonyDashboardConnectionKind;
  label: string;
}) {
  const label = input.kind === "connected" ? "Connected" : "Not Connected";

  return <Badge variant={variantByConnectionKind[input.kind]}>{label}</Badge>;
}
