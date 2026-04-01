"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CircleEllipsisIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { ConnectionStateBadge } from "@/components/connection-state-badge";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import type { SymphonyRuntimeStateResult } from "@symphony/contracts";
import { useDashboardActiveIssues } from "@/hooks/use-dashboard-active-issues";
import { useRuntimeSummary } from "@/hooks/use-runtime-summary";

export function ControlPlaneShell(input: {
  connection?: SymphonyDashboardFoundationModel["connection"];
  children?: ReactNode;
  sidebarLoading?: boolean;
  sidebarRuntimeSummary?: SymphonyRuntimeStateResult | null;
  model: SymphonyDashboardFoundationModel;
}) {
  const connection = input.connection ?? input.model.connection;

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="relative">
            <Link
              href="/"
              aria-label="Symphony Control Plane"
              title="Symphony"
              className="flex min-h-12 items-center gap-2 rounded-md px-2 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <CircleEllipsisIcon />
              <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-lg font-semibold">Symphony</span>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent>
            {input.sidebarRuntimeSummary !== undefined ? (
              <SidebarNavigationFromSummary
                loading={input.sidebarLoading ?? false}
                model={input.model}
                runtimeSummary={input.sidebarRuntimeSummary}
              />
            ) : (
              <SidebarNavigationLive model={input.model} />
            )}
          </SidebarContent>
          <SidebarFooter>
            <ThemeToggleButton />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="h-svh overflow-y-auto">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1" />
            </div>
            <ConnectionStateBadge
              kind={connection.kind}
              label={connection.label}
            />
          </header>
          <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col p-4 md:p-6">
            {input.children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function ThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme !== "light" : true;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <SunIcon data-icon="inline-start" />
      ) : (
        <MoonIcon data-icon="inline-start" />
      )}
      <span className="group-data-[collapsible=icon]:hidden">
        {isDark ? "Light mode" : "Dark mode"}
      </span>
    </Button>
  );
}

function SidebarNavigationLive(input: {
  model: SymphonyDashboardFoundationModel;
}) {
  const runtimeSummaryState = useRuntimeSummary({
    stateUrl: input.model.runtimeSurface.stateUrl,
    websocketUrl: input.model.websocketUrl
  });
  const activeIssuesState = useDashboardActiveIssues({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    runtimeSummary: runtimeSummaryState.runtimeSummary
  });

  return (
    <DashboardNavigation
      items={input.model.navigation}
      activeIssues={activeIssuesState.activeIssues}
      loadingActiveIssues={
        runtimeSummaryState.loading || activeIssuesState.loading
      }
    />
  );
}

function SidebarNavigationFromSummary(input: {
  loading: boolean;
  model: SymphonyDashboardFoundationModel;
  runtimeSummary: SymphonyRuntimeStateResult | null;
}) {
  const activeIssuesState = useDashboardActiveIssues({
    runtimeBaseUrl: input.model.runtimeBaseUrl,
    runtimeSummary: input.runtimeSummary
  });

  return (
    <DashboardNavigation
      items={input.model.navigation}
      activeIssues={activeIssuesState.activeIssues}
      loadingActiveIssues={input.loading || activeIssuesState.loading}
    />
  );
}
