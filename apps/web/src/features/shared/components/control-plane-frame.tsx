"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CircleEllipsisIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { DashboardNavigation } from "@/features/shared/components/dashboard-navigation";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { useDashboardActiveIssues } from "@/hooks/use-dashboard-active-issues";
import { useRuntimeSummary } from "@/hooks/use-runtime-summary";

export function ControlPlaneFrame(input: { children: ReactNode }) {
  const model = useControlPlaneModel();
  const runtimeSummaryState = useRuntimeSummary({
    stateUrl: model.runtimeSurface.stateUrl,
    websocketUrl: model.websocketUrl
  });
  const activeIssuesState = useDashboardActiveIssues({
    runtimeBaseUrl: model.runtimeBaseUrl,
    runtimeSummary: runtimeSummaryState.runtimeSummary
  });

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
            <DashboardNavigation
              items={model.navigation}
              activeIssues={activeIssuesState.activeIssues}
              loadingActiveIssues={
                runtimeSummaryState.loading || activeIssuesState.loading
              }
            />
          </SidebarContent>
          <SidebarFooter>
            <ThemeToggleButton />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-h-svh">{input.children}</SidebarInset>
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
