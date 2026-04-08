"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CircleEllipsisIcon, MoonIcon, SunIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
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
import { readRepoScopeFromSearchParams } from "@/core/control-plane-repo-scope";
import { DashboardNavigation } from "@/features/shared/components/dashboard-navigation";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { ControlPlaneRepoProvider } from "@/features/shared/components/control-plane-repo-context";
import { ControlPlaneRuntimeProvider } from "@/features/shared/components/control-plane-runtime-context";
import type { ControlPlaneRepositorySummary } from "@/core/control-plane-repo-scope";
import { useDashboardIssues } from "@/hooks/use-dashboard-issues";
import { useRuntimeSummary } from "@/hooks/use-runtime-summary";
import type { SymphonyRuntimeStateResult } from "@symphony/contracts";

type RuntimeSummaryWithRepositories = SymphonyRuntimeStateResult & {
  repositories?: ControlPlaneRepositorySummary[];
};

export function ControlPlaneFrame(input: { children: ReactNode }) {
  const model = useControlPlaneModel();
  const searchParams = useSearchParams();
  const selectedRepo = readRepoScopeFromSearchParams(searchParams);
  const runtimeSummaryState = useRuntimeSummary({
    stateUrl: model.runtimeSurface.stateUrl,
    websocketUrl: model.websocketUrl
  });
  const dashboardIssuesState = useDashboardIssues({
    runtimeBaseUrl: model.runtimeBaseUrl,
    websocketUrl: model.websocketUrl,
    selectedRepo
  });
  const runtimeSummary = runtimeSummaryState.runtimeSummary as
    | RuntimeSummaryWithRepositories
    | null;
  const repositories: ControlPlaneRepositorySummary[] =
    runtimeSummary?.repositories ??
    dashboardIssuesState.repositories.map((repositoryKey) => ({
      repositoryKey,
      linear: {
        teamKey: "unbound"
      }
    }));

  return (
    <TooltipProvider>
      <ControlPlaneRuntimeProvider runtimeSummaryState={runtimeSummaryState}>
        <ControlPlaneRepoProvider
          value={{
            selectedRepo,
            repositories
          }}
        >
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
                  issues={dashboardIssuesState.issues}
                  loadingIssues={
                    runtimeSummaryState.loading || dashboardIssuesState.loading
                  }
                />
              </SidebarContent>
              <SidebarFooter>
                <ThemeToggleButton />
              </SidebarFooter>
            </Sidebar>

            <SidebarInset className="min-h-svh">{input.children}</SidebarInset>
          </SidebarProvider>
        </ControlPlaneRepoProvider>
      </ControlPlaneRuntimeProvider>
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
      size="lg"
      className="w-full justify-start gap-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 cursor-pointer"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
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
