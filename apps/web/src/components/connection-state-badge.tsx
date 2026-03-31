import { Badge } from "@/components/ui/badge";
import type { SymphonyDashboardConnectionKind } from "@/core/dashboard-foundation";

const variantByConnectionKind: Record<
  SymphonyDashboardConnectionKind,
  "secondary" | "default" | "destructive"
> = {
  waiting: "secondary",
  connected: "default",
  degraded: "destructive"
};

export function ConnectionStateBadge(input: {
  kind: SymphonyDashboardConnectionKind;
  label: string;
}) {
  return <Badge variant={variantByConnectionKind[input.kind]}>{input.label}</Badge>;
}
