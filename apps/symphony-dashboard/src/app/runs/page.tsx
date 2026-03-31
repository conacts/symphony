import Link from "next/link";
import { ControlPlaneShell } from "@/components/control-plane-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";

export default function RunsPage() {
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return (
    <ControlPlaneShell model={model}>
      <Card>
        <CardHeader>
          <CardTitle>Run drilldown</CardTitle>
          <CardDescription>
            Run detail pages are reached from issue history and problem runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>
            Use the issue index to browse recent runs or jump straight into problem runs
            to inspect non-success outcomes.
          </p>
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <Link href="/issues">Open issues</Link>
            </Button>
            <Button asChild>
              <Link href="/problem-runs">Open problem runs</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </ControlPlaneShell>
  );
}
