import type { SymphonyForensicsProblemRunsQuery } from "@symphony/contracts";
import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";
import { ProblemRunsLiveScreen } from "@/components/problem-runs-live-screen";

function parseLimit(value: string | string[] | undefined, defaultValue: number) {
  if (typeof value !== "string") {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : defaultValue;
}

function parseOptionalString(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}

export default async function ProblemRunsPage(input: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await input.searchParams;
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());
  const query: SymphonyForensicsProblemRunsQuery = {
    limit: parseLimit(searchParams.limit, 200),
    outcome: parseOptionalString(searchParams.outcome),
    issueIdentifier: parseOptionalString(searchParams.issue_identifier)
  };

  return <ProblemRunsLiveScreen model={model} query={query} />;
}
