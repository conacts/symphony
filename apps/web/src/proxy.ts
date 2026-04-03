import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const upstreamUrl = new URL(request.url);
  upstreamUrl.protocol = "http:";
  upstreamUrl.hostname = "127.0.0.1";
  upstreamUrl.port = "4400";

  return NextResponse.rewrite(upstreamUrl);
}

export const config = {
  matcher: ["/api/v1/:path*"]
};
