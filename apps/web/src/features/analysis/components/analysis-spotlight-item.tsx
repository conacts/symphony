import React from "react";
import { cn } from "@/lib/utils";

export function AnalysisSpotlightItem(input: {
  label: string;
  value: string;
  detail: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-background/40 p-4",
        input.className
      )}
    >
      <p className="text-sm text-muted-foreground">{input.label}</p>
      <p className="mt-2 break-all text-xl font-semibold">{input.value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{input.detail}</p>
    </div>
  );
}
