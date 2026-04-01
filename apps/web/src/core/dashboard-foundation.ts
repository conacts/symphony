import {
  SYMPHONY_CONTRACTS_PACKAGE_NAME,
  symphonySchemaVersion
} from "@symphony/contracts";
import {
  loadSymphonyDashboardEnv,
  type SymphonyDashboardEnv
} from "@/core/env";

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
  const sanitizedBaseUrl = runtimeBaseUrl.replace(/\/+$/u, "");
  const runtimeUrl = new URL(sanitizedBaseUrl);

  const stateUrl = new URL("/api/v1/state", runtimeUrl);
  const refreshUrl = new URL("/api/v1/refresh", runtimeUrl);
  const issuesUrl = new URL("/api/v1/issues", runtimeUrl);
  const websocketUrl = new URL("/api/v1/ws", runtimeUrl);

  websocketUrl.protocol =
    runtimeUrl.protocol === "https:" ? "wss:" : "ws:";

  return {
    stateUrl: stateUrl.toString(),
    refreshUrl: refreshUrl.toString(),
    issuesUrl: issuesUrl.toString(),
    websocketUrl: websocketUrl.toString()
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
      issuesUrl: runtimeSurface.issuesUrl
    },
    connection: {
      kind: "waiting",
      label: "not connected",
      detail:
        "The dashboard is wired to the Hono runtime and typed websocket stream, with runtime summary, forensic drilldowns, and parity-safe operator actions available from the current shell."
    },
    navigation: [
      {
        href: "/issues",
        label: "Issues",
        description: "Browse recorded issues and drill into the run history for each one.",
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
