"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  ChartColumnIncreasingIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  Settings2Icon
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar";
import type {
  SymphonyDashboardActiveIssue,
  SymphonyDashboardNavigationItem
} from "@/core/dashboard-foundation";

const navigationIcons = {
  Overview: LayoutDashboardIcon,
  Analysis: ChartColumnIncreasingIcon,
  "Failure analysis": ChartColumnIncreasingIcon,
  "Token analysis": ChartColumnIncreasingIcon,
  Issues: FolderKanbanIcon,
  "Runtime health": ActivityIcon,
  "Runtime config": Settings2Icon
} as const;

export function DashboardNavigation(input: {
  items: SymphonyDashboardNavigationItem[];
  issues: SymphonyDashboardActiveIssue[];
  loadingIssues: boolean;
}) {
  const pathname = usePathname();

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Pages</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-2">
            {input.items.map((item) => {
              const Icon = navigationIcons[item.label as keyof typeof navigationIcons];

              return (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavigationActive(pathname, item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href} aria-label={item.label}>
                      {Icon ? <Icon /> : null}
                      <span className="truncate group-data-[collapsible=icon]:hidden">
                        {item.label}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Tickets</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-2">
            {input.loadingIssues && input.issues.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="group-data-[collapsible=icon]:hidden"
                  disabled
                >
                  <span>Loading tickets…</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : input.issues.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="group-data-[collapsible=icon]:hidden"
                  disabled
                >
                  <span>No tickets recorded</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              input.issues.map((issue) => (
                <SidebarMenuItem key={`${issue.href}:${issue.trackerIssueKey}`}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === issue.href}
                    tooltip={`${issue.title} - ${issue.state}`}
                  >
                    <Link href={issue.href} aria-label={`${issue.title} - ${issue.state}`}>
                      <span className="hidden w-full truncate text-center font-mono text-[9px] leading-none tracking-[0.08em] text-foreground uppercase group-data-[collapsible=icon]:block">
                        {formatCollapsedIssueState(issue.state)}
                      </span>
                      <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                        <span className="block truncate">{issue.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {issue.state}
                        </span>
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

function isNavigationActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatCollapsedIssueState(state: string): string {
  const words = state.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
