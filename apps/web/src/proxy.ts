import { NextResponse, type NextRequest } from "next/server";
import {
  buildSymphonyAgentOverflowResult,
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsSuccessMetricsResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";
import {
  buildMockIssueDetailResult,
  buildMockIssueForensicsBundleResult,
  buildMockIssueListResult,
  buildMockProblemRunsResult,
  buildMockRunDetailResult,
  buildMockRuntimeHealthResult,
  buildMockRuntimeIssueResult,
  buildMockRuntimeLogsResult,
  buildMockRuntimeRefreshResult,
  buildMockRuntimeStateResult,
  createMockEnvelope,
  isMockRuntimeEnabled
} from "@/mock/symphony-runtime";

export function proxy(request: NextRequest) {
  const mockResponse = buildMockProxyResponse(request);
  if (mockResponse) {
    return mockResponse;
  }

  const upstreamUrl = new URL(request.url);
  upstreamUrl.protocol = "http:";
  upstreamUrl.hostname = "127.0.0.1";
  upstreamUrl.port = "4400";

  return NextResponse.rewrite(upstreamUrl);
}

export function buildMockProxyResponse(
  request: Pick<NextRequest, "url" | "method">
): NextResponse | null {
  if (!isMockRuntimeEnabled()) {
    return null;
  }

  const url = new URL(request.url);
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  if (request.method === "GET" && pathname === "/api/v1/state") {
    return NextResponse.json(createMockEnvelope(buildMockRuntimeStateResult()));
  }

  if (request.method === "POST" && pathname === "/api/v1/refresh") {
    return NextResponse.json(createMockEnvelope(buildMockRuntimeRefreshResult()));
  }

  if (request.method === "GET" && pathname === "/api/v1/health") {
    return NextResponse.json(createMockEnvelope(buildMockRuntimeHealthResult()));
  }

  if (request.method === "GET" && pathname === "/api/v1/runtime/logs") {
    return NextResponse.json(
      createMockEnvelope(buildMockRuntimeLogsResult(searchParams))
    );
  }

  if (request.method === "GET" && pathname === "/api/v1/issues") {
    return NextResponse.json(createMockEnvelope(buildMockIssueListResult(searchParams)));
  }

  if (request.method === "GET" && pathname === "/api/v1/problem-runs") {
    return NextResponse.json(
      createMockEnvelope(buildMockProblemRunsResult(searchParams))
    );
  }

  if (request.method === "GET" && pathname === "/api/v1/success-metrics") {
    return NextResponse.json(
      createMockEnvelope(buildSymphonyForensicsSuccessMetricsResult())
    );
  }

  const issueBundleMatch = pathname.match(
    /^\/api\/v1\/issues\/([^/]+)\/forensics-bundle$/u
  );
  if (request.method === "GET" && issueBundleMatch) {
    const result = buildMockIssueForensicsBundleResult(
      decodeURIComponent(issueBundleMatch[1]!),
      searchParams
    );
    return result
      ? NextResponse.json(createMockEnvelope(result))
      : NextResponse.json(
          createMockEnvelope({ message: "Not found." }),
          { status: 404 }
        );
  }

  const issueDetailMatch = pathname.match(/^\/api\/v1\/issues\/([^/]+)$/u);
  if (request.method === "GET" && issueDetailMatch) {
    const result = buildMockIssueDetailResult(
      decodeURIComponent(issueDetailMatch[1]!),
      searchParams
    );
    return result
      ? NextResponse.json(createMockEnvelope(result))
      : NextResponse.json(
          createMockEnvelope({ message: "Not found." }),
          { status: 404 }
        );
  }

  const runDetailMatch = pathname.match(/^\/api\/v1\/runs\/([^/]+)$/u);
  if (request.method === "GET" && runDetailMatch) {
    const result = buildMockRunDetailResult(decodeURIComponent(runDetailMatch[1]!));
    return result
      ? NextResponse.json(createMockEnvelope(result))
      : NextResponse.json(
          createMockEnvelope({ message: "Not found." }),
          { status: 404 }
        );
  }

  const agentArtifactsMatch = pathname.match(
    /^\/api\/v1\/agent\/runs\/([^/]+)\/artifacts$/u
  );
  if (request.method === "GET" && agentArtifactsMatch) {
    const runId = decodeURIComponent(agentArtifactsMatch[1]!);
    return NextResponse.json(
      createMockEnvelope(
        buildSymphonyAgentRunArtifactsResult({
          run: {
            ...buildSymphonyAgentRunArtifactsResult().run,
            runId
          }
        })
      )
    );
  }

  const agentOverflowMatch = pathname.match(
    /^\/api\/v1\/agent\/runs\/([^/]+)\/overflow\/([^/]+)$/u
  );
  if (request.method === "GET" && agentOverflowMatch) {
    const runId = decodeURIComponent(agentOverflowMatch[1]!);
    const overflowId = decodeURIComponent(agentOverflowMatch[2]!);
    return NextResponse.json(
      createMockEnvelope(
        buildSymphonyAgentOverflowResult({
          runId,
          overflow: {
            ...buildSymphonyAgentOverflowResult().overflow,
            runId,
            overflowId
          }
        })
      )
    );
  }

  const runtimeIssueMatch = pathname.match(/^\/api\/v1\/([^/]+)$/u);
  if (request.method === "GET" && runtimeIssueMatch) {
    const result = buildMockRuntimeIssueResult(
      decodeURIComponent(runtimeIssueMatch[1]!)
    );
    return result
      ? NextResponse.json(createMockEnvelope(result))
      : NextResponse.json(
          createMockEnvelope({ message: "Not found." }),
          { status: 404 }
        );
  }

  return NextResponse.json(
    createMockEnvelope({
      message: `Mock runtime route not implemented for ${request.method} ${pathname}.`
    }),
    { status: 501 }
  );
}

export const config = {
  matcher: ["/api/v1/:path*"]
};
