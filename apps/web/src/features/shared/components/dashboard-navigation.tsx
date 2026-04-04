"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  ChartColumnIncreasingIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon
} from "lucide-react";
import { IssueStateIcon } from "@/components/issue-state-icon";
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
  "Performance analysis": ChartColumnIncreasingIcon,
  "Token analysis": ChartColumnIncreasingIcon,
  Issues: FolderKanbanIcon,
  "Runtime health": ActivityIcon
} as const;

export function DashboardNavigation(input: {
  items: SymphonyDashboardNavigationItem[];
  activeIssues: SymphonyDashboardActiveIssue[];
  loadingActiveIssues: boolean;
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
        <SidebarGroupLabel>Active Tickets</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-2">
            {input.loadingActiveIssues && input.activeIssues.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="group-data-[collapsible=icon]:hidden"
                  disabled
                >
                  <span>Loading active tickets…</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : input.activeIssues.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="group-data-[collapsible=icon]:hidden"
                  disabled
                >
                  <span>No active tickets</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              input.activeIssues.map((issue) => (
                <SidebarMenuItem key={issue.issueIdentifier}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === issue.href}
                    tooltip={`${issue.title} - ${issue.state}`}
                  >
                    <Link href={issue.href} aria-label={`${issue.title} - ${issue.state}`}>
                      <IssueStateIcon state={issue.state} />
                      <span className="truncate group-data-[collapsible=icon]:hidden">
                        {issue.title}
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
