"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select";
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
import {
	formatControlPlaneRepositoryName,
	readRepoScopeFromSearchParams
} from "@/core/control-plane-repo-scope";
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
  const pathname = usePathname();
  const router = useRouter();
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
								<RepositoryScopeSelect
									repositories={repositories}
									selectedRepo={selectedRepo ?? null}
									onValueChange={(nextRepo) => {
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
									}}
								/>
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

function RepositoryScopeSelect(input: {
	repositories: ControlPlaneRepositorySummary[];
	selectedRepo: string | null;
	onValueChange: (nextRepo: string | null) => void;
}) {
	const selectedRepository =
		input.repositories.find(
			(repository) => repository.repositoryKey === input.selectedRepo
		) ?? null;

	if (input.repositories.length === 0) {
		return (
			<Link
				href="/"
				aria-label="Symphony Control Plane"
				title="Symphony"
				className="flex h-12 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
			>
				All repositories
			</Link>
		);
	}

	return (
		<Select
			value={input.selectedRepo ?? "__all__"}
			onValueChange={input.onValueChange}
		>
			<SelectTrigger
				size="default"
				aria-label="Repository scope"
				className="group flex w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 text-sm"
			>
				<SelectValue className="truncate" placeholder="All repositories">
					{selectedRepository
						? formatControlPlaneRepositoryName(selectedRepository.repositoryKey)
						: "All repositories"}
				</SelectValue>
			</SelectTrigger>
			<SelectContent align="start">
				<SelectItem value="__all__">All repositories</SelectItem>
				{input.repositories.map((repository) => (
					<SelectItem key={repository.repositoryKey} value={repository.repositoryKey}>
						{formatControlPlaneRepositoryName(repository.repositoryKey)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
