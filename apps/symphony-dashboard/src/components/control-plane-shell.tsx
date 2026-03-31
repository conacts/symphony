import {
  ArrowUpRightIcon,
  RadioTowerIcon,
  Rows3Icon,
  SignalIcon,
  WorkflowIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { ConnectionStateBadge } from "@/components/connection-state-badge";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import { FoundationTrackCard } from "@/components/foundation-track-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";

export function ControlPlaneShell(input: {
  connection?: SymphonyDashboardFoundationModel["connection"];
  children?: ReactNode;
  model: SymphonyDashboardFoundationModel;
}) {
  const { model } = input;
  const connection = input.connection ?? model.connection;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_oklch(0.92_0.06_265/.5),_transparent_28%),radial-gradient(circle_at_bottom_right,_oklch(0.88_0.04_210/.35),_transparent_24%)]" />
      <div className="relative grid min-h-dvh lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="border-b border-border/70 bg-card/80 backdrop-blur xl:border-b-0 xl:border-r">
          <div className="flex h-full flex-col gap-6 p-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <WorkflowIcon />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                    Symphony
                  </span>
                  <span className="text-lg font-semibold">Developer Control Plane</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{model.tagline}</p>
            </div>

            <Separator />

            <DashboardNavigation items={model.navigation} />

            <Card className="mt-auto">
              <CardHeader>
                <CardTitle>Contracts</CardTitle>
                <CardDescription>
                  The dashboard shell already points at the admitted runtime boundary.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
                <div>Package: {model.contractsPackageName}</div>
                <div>Schema version: {model.schemaVersion}</div>
              </CardContent>
            </Card>
          </div>
        </aside>

        <main className="flex flex-col gap-8 p-6 lg:p-10">
          <Card className="overflow-hidden">
            <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex max-w-3xl flex-col gap-3">
                <div className="flex items-center gap-3">
                  <ConnectionStateBadge
                    kind={connection.kind}
                    label={connection.label}
                  />
                  <span className="text-sm text-muted-foreground">
                    WebSocket-first dashboard shell
                  </span>
                </div>
                <CardTitle className="text-3xl lg:text-4xl">
                  {model.title}
                </CardTitle>
                <CardDescription className="max-w-2xl text-base">
                  {connection.detail}
                </CardDescription>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {model.actionSurfaces.map((actionSurface) => (
                  <Button key={actionSurface.label} asChild variant="outline">
                    <a
                      href={actionSurface.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {actionSurface.label}
                      <ArrowUpRightIcon data-icon="inline-end" />
                    </a>
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardFooter className="flex flex-col items-start gap-3 border-t border-border/70 pt-6 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
              <span>Runtime origin: {model.runtimeBaseUrl}</span>
              <span>Realtime endpoint: {model.websocketUrl}</span>
            </CardFooter>
          </Card>

          {input.children ? (
            input.children
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <SignalIcon />
                      Realtime shell
                    </CardTitle>
                    <CardDescription>
                      Connection-state affordances are ready for the live runtime summary.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    The shell keeps HTTP surfaces and the WebSocket transport visible
                    without inventing local runtime types.
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Rows3Icon />
                      Foundation-first navigation
                    </CardTitle>
                    <CardDescription>
                      Issues, runs, and problem runs stay product-visible without
                      shipping unfinished screens.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Each navigation surface is scaffolded so the next tickets can
                    land on stable layout and visual primitives.
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <RadioTowerIcon />
                      Local shadcn foundation
                    </CardTitle>
                    <CardDescription>
                      The dashboard is running on the app-local shadcn install for now.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Shared primitive extraction is deferred, but the operator shell,
                    tokens, and connection-state affordances are now in place.
                  </CardContent>
                </Card>
              </div>

              <section className="grid gap-4 xl:grid-cols-3">
                {model.foundationTracks.map((track) => (
                  <FoundationTrackCard
                    key={track.title}
                    description={track.description}
                    status={track.status}
                    title={track.title}
                  />
                ))}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
