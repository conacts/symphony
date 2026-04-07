"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";
import {
  ControlPlaneBreadcrumbs,
  type ControlPlaneBreadcrumbItem
} from "@/features/shared/components/control-plane-breadcrumbs";
import { ConnectionStateBadge } from "@/features/shared/components/connection-state-badge";
import { useControlPlaneRepoContext } from "@/features/shared/components/control-plane-repo-context";
import {
  describeControlPlaneRepositoryScope
} from "@/core/control-plane-repo-scope";

export function ControlPlanePage(input: {
  connection: SymphonyDashboardFoundationModel["connection"];
  breadcrumbs?: ControlPlaneBreadcrumbItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const repoContext = useControlPlaneRepoContext();
  const selectedRepository = useMemo(
    () =>
      repoContext.repositories.find(
        (repository) => repository.repositoryKey === repoContext.selectedRepo
      ) ?? null,
    [repoContext.repositories, repoContext.selectedRepo]
  );

  function updateRepoScope(nextRepo: string | null) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (nextRepo === null || nextRepo === "__all__") {
      nextSearchParams.delete("repo");
    } else {
      nextSearchParams.set("repo", nextRepo);
    }

    const query = nextSearchParams.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, {
      scroll: false
    });
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-30 flex min-h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:left-(--sidebar-width) group-data-[collapsible=icon]:md:left-(--sidebar-width-icon)">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="-ml-1" />
          <ControlPlaneBreadcrumbs items={input.breadcrumbs ?? []} />
        </div>
        <div className="flex items-center gap-3">
          {repoContext.repositories.length > 0 ? (
            <div className="flex items-center gap-2">
              {selectedRepository ? (
                <div className="hidden max-w-[18rem] flex-col items-end text-right text-[11px] leading-tight text-muted-foreground md:flex">
                  <span className="truncate font-medium text-foreground">
                    {selectedRepository.repositoryKey}
                  </span>
                  <span className="truncate">
                    {describeControlPlaneRepositoryScope(selectedRepository)}
                  </span>
                </div>
              ) : null}
              <Select
                value={repoContext.selectedRepo ?? "__all__"}
                onValueChange={updateRepoScope}
              >
                <SelectTrigger size="sm" aria-label="Repository scope">
                  <SelectValue placeholder="All repositories" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="__all__">All repositories</SelectItem>
                  {repoContext.repositories.map((repository) => (
                    <SelectItem key={repository.repositoryKey} value={repository.repositoryKey}>
                      <span className="flex flex-col items-start">
                        <span>{repository.repositoryKey}</span>
                        <span className="text-xs text-muted-foreground">
                          {describeControlPlaneRepositoryScope(repository)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <ConnectionStateBadge
            kind={input.connection.kind}
            label={input.connection.label}
          />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col p-4 pt-24 md:p-6 md:pt-24">
        {input.children}
      </main>
    </>
  );
}
