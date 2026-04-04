"use client";

import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { ConnectionStateBadge } from "@/features/shared/components/connection-state-badge";

export function ControlPlanePage(input: {
  connection: SymphonyDashboardFoundationModel["connection"];
  children: ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-1" />
        </div>
        <ConnectionStateBadge
          kind={input.connection.kind}
          label={input.connection.label}
        />
      </header>
      <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col p-4 md:p-6">
        {input.children}
      </main>
    </>
  );
}
