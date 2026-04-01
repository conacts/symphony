"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ConnectionStateBadge } from "@/components/connection-state-badge";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import { useDashboardActiveIssues } from "@/hooks/use-dashboard-active-issues";

export function ControlPlaneShell(input: {
  connection?: SymphonyDashboardFoundationModel["connection"];
  children?: ReactNode;
  model: SymphonyDashboardFoundationModel;
}) {
  const connection = input.connection ?? input.model.connection;
  const activeIssuesState = useDashboardActiveIssues({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    stateUrl: input.model.runtimeSurface.stateUrl,
    websocketUrl: input.model.websocketUrl
  });

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar>
        <SidebarHeader className="relative">
          <div className="group-data-[collapsible=icon]:hidden">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="lg">
                  <Link href="/" aria-label="Symphony Control Plane" className="pr-10">
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-semibold">Symphony</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <DashboardNavigation
            items={input.model.navigation}
            activeIssues={activeIssuesState.activeIssues}
            loadingActiveIssues={activeIssuesState.loading}
          />
        </SidebarContent>
        </Sidebar>

        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <span className="truncate text-sm text-muted-foreground">
                {input.model.tagline}
              </span>
            </div>
            <ConnectionStateBadge
              kind={connection.kind}
              label={connection.label}
            />
          </header>
          <main className="flex flex-1 flex-col p-4 md:p-6">{input.children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
