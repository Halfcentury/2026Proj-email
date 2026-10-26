import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  appendVaryAccept,
  prefersMarkdown,
} from "@/utils/agent-markdown/accept";
import {
  getMarkdownForPath,
  markdownResponse,
} from "@/utils/agent-markdown/content";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/utils/branding";
import { COURSE_MODE, isProductPathEnabled } from "@/utils/product-scope";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!isProductPathEnabled(pathname)) {
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/ingest") ||
      pathname.startsWith("/_proxy/")
    ) {
      return NextResponse.json(
        { error: "此功能不在当前项目范围内" },
        { status: 404 },
      );
    }
    return NextResponse.redirect(new URL("/mail", request.url));
  }
  if (COURSE_MODE && pathname === "/") {
    return NextResponse.redirect(new URL("/mail", request.url));
  }
  if (isNextInternalRequest(request)) {
    return withVaryAccept(NextResponse.next());
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return withVaryAccept(NextResponse.next());
  }

  if (!prefersMarkdown(request.headers.get("accept"))) {
    return withVaryAccept(NextResponse.next());
  }

  const pageMarkdown = getMarkdownForPath(
    request.nextUrl.pathname,
    request.nextUrl.origin,
    { brandName: BRAND_NAME, supportEmail: SUPPORT_EMAIL },
  );
  if (pageMarkdown) {
    return markdownResponse(pageMarkdown);
  }

  return withVaryAccept(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)",
  ],
};

function isNextInternalRequest(request: NextRequest): boolean {
  return (
    request.headers.has("rsc") ||
    request.headers.has("next-router-state-tree") ||
    request.headers.has("next-router-prefetch") ||
    request.headers.has("next-router-segment-prefetch")
  );
}

function withVaryAccept(response: NextResponse): NextResponse {
  appendVaryAccept(response.headers);
  return response;
}
