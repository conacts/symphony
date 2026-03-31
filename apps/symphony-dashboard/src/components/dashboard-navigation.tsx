import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SymphonyDashboardNavigationItem } from "@/core/dashboard-foundation";

export function DashboardNavigation(input: {
  items: SymphonyDashboardNavigationItem[];
}) {
  return (
    <nav aria-label="Symphony dashboard" className="flex flex-col gap-3">
      {input.items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={cn(
            "flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/70 p-4 transition-colors hover:bg-accent/60"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{item.label}</span>
            <Badge
              variant={item.readiness === "available" ? "secondary" : "outline"}
            >
              {item.readiness === "available" ? "Available" : "Coming next"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{item.description}</p>
        </Link>
      ))}
    </nav>
  );
}
