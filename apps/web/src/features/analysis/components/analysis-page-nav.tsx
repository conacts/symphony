"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const analysisLinks = [
  {
    href: "/analysis",
    label: "Overview",
    description: "Start with the current cross-run picture."
  },
  {
    href: "/analysis/failures",
    label: "Failures",
    description: "See which failure modes are dominating."
  },
  {
    href: "/analysis/performance",
    label: "Performance",
    description: "See which commands, tools, and turns are slow or flaky."
  },
  {
    href: "/analysis/tokens",
    label: "Tokens",
    description: "See where token pressure is concentrating."
  }
] as const;

export function AnalysisPageNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {analysisLinks.map((link) => {
        const isActive = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={search ? `${link.href}?${search}` : link.href}
            className={cn(
              "rounded-xl border border-border/70 p-4 transition-colors",
              isActive ? "bg-accent/40" : "bg-background/40 hover:bg-accent/20"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <p className="text-sm font-medium">{link.label}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {link.description}
            </p>
          </Link>
        );
      })}
    </section>
  );
}
