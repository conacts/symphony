import {
  SYMPHONY_CONTRACTS_PACKAGE_NAME,
  symphonySchemaVersion
} from "@symphony/contracts";
import {
  loadSymphonyDashboardEnv,
  type SymphonyDashboardEnv
} from "@/core/env";
import {
  createRuntimeUrl,
  createRuntimeWebsocketUrl
} from "@/core/runtime-url";

export type SymphonyDashboardConnectionKind =
  | "waiting"
  | "connected"
  | "degraded";

export type SymphonyDashboardNavigationItem = {
  href: string;
  label: string;
  description: string;
  readiness: "available" | "foundation";
};

export type SymphonyDashboardActiveIssue = {
  issueIdentifier: string;
  title: string;
  state: string;
  href: string;
};

export type SymphonyDashboardFoundationModel = {
  title: string;
  tagline: string;
  schemaVersion: string;
  contractsPackageName: string;
  runtimeBaseUrl: string;
  websocketUrl: string;
  runtimeSurface: {
    stateUrl: string;
    refreshUrl: string;
    issuesUrl: string;
    problemRunsUrl: string;
    healthUrl: string;
    runtimeLogsUrl: string;
  };
  connection: {
    kind: SymphonyDashboardConnectionKind;
    label: string;
    detail: string;
  };
  navigation: SymphonyDashboardNavigationItem[];
  actionSurfaces: Array<{
    label: string;
    href: string;
  }>;
  foundationTracks: Array<{
    title: string;
    description: string;
    status: string;
  }>;
};

export function buildSymphonyRuntimeSurfaceUrls(runtimeBaseUrl: string) {
  return {
    stateUrl: createRuntimeUrl("/api/v1/state", runtimeBaseUrl),
    refreshUrl: createRuntimeUrl("/api/v1/refresh", runtimeBaseUrl),
    issuesUrl: createRuntimeUrl("/api/v1/issues", runtimeBaseUrl),
    problemRunsUrl: createRuntimeUrl("/api/v1/problem-runs", runtimeBaseUrl),
    healthUrl: createRuntimeUrl("/api/v1/health", runtimeBaseUrl),
    runtimeLogsUrl: createRuntimeUrl("/api/v1/runtime/logs", runtimeBaseUrl),
    websocketUrl: createRuntimeWebsocketUrl("/api/v1/ws", runtimeBaseUrl)
  };
}

export function buildSymphonyDashboardFoundation(
  env: SymphonyDashboardEnv = loadSymphonyDashboardEnv()
): SymphonyDashboardFoundationModel {
  const runtimeSurface = buildSymphonyRuntimeSurfaceUrls(env.runtimeBaseUrl);

  return {
    title: "Symphony Control Plane",
    tagline:
      "A realtime operator shell for runs, issues, and intervention surfaces without turning Linear into a comment firehose.",
    schemaVersion: symphonySchemaVersion,
    contractsPackageName: SYMPHONY_CONTRACTS_PACKAGE_NAME,
    runtimeBaseUrl: env.runtimeBaseUrl,
    websocketUrl: runtimeSurface.websocketUrl,
    runtimeSurface: {
      stateUrl: runtimeSurface.stateUrl,
      refreshUrl: runtimeSurface.refreshUrl,
      issuesUrl: runtimeSurface.issuesUrl,
      problemRunsUrl: runtimeSurface.problemRunsUrl,
      healthUrl: runtimeSurface.healthUrl,
      runtimeLogsUrl: runtimeSurface.runtimeLogsUrl
    },
    connection: {
      kind: "waiting",
      label: "not connected",
      detail:
        "The dashboard is wired to the Hono runtime and typed websocket stream, with runtime summary, forensic drilldowns, and parity-safe operator actions available from the current shell."
    },
    navigation: [
      {
        href: "/",
        label: "Overview",
        description: "Review the live runtime summary, retry queue, and operator refresh action.",
        readiness: "available"
      },
      {
        href: "/analysis/failures",
        label: "Failure analysis",
        description: "Review cross-run failure patterns and the issues carrying the highest failure load.",
        readiness: "available"
      },
      {
        href: "/analysis/performance",
        label: "Performance analysis",
        description: "Review command and tool execution hotspots across recent sampled runs.",
        readiness: "available"
      },
      {
        href: "/issues",
        label: "Issues",
        description: "Browse recorded issues, open run history, and drill into issue activity.",
        readiness: "available"
      },
      {
        href: "/runtime/health",
        label: "Runtime health",
        description: "Check the runtime poller, DB readiness, and recent scheduler state.",
        readiness: "available"
      }
    ],
    actionSurfaces: [
      {
        label: "Runtime state",
        href: runtimeSurface.stateUrl
      },
      {
        label: "Issue inventory",
        href: runtimeSurface.issuesUrl
      },
      {
        label: "Problem runs",
        href: runtimeSurface.problemRunsUrl
      },
      {
        label: "Runtime health",
        href: runtimeSurface.healthUrl
      },
      {
        label: "Runtime logs",
        href: runtimeSurface.runtimeLogsUrl
      }
    ],
    foundationTracks: [
      {
        title: "Realtime dashboard shell",
        description:
          "Navigation, layout, and connection-state affordances now support both the runtime summary and forensic drilldowns.",
        status: "Live"
      },
      {
        title: "Shared primitive package",
        description:
          "Local shadcn primitives are installed in the dashboard app now so the operator shell can move forward without blocking on package extraction.",
        status: "Extraction deferred"
      },
      {
        title: "Typed runtime boundary",
        description:
          "The dashboard foundation anchors itself to the runtime URLs and schema version without inventing local transport shapes or a hidden control lane.",
        status: "Live"
      }
    ]
  };
}
