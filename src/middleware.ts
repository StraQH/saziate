import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAppEnv } from "@/lib/env";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const env = getAppEnv();
  const isDemo = env.NEXT_PUBLIC_MOCK_MODE === "true" || request.nextUrl.hostname.includes("demo.");

  // 1. Bypass authentication filters completely in Mock Mode / Demo
  if (isDemo) {
    return NextResponse.next();
  }

  // 2. Define protected dashboard path patterns
  const isProtectedPath = 
    path.startsWith("/psp") || 
    path.startsWith("/agent") || 
    path.startsWith("/admin") ||
    path.startsWith("/resident");

  if (isProtectedPath) {
    // Check both environment-prefixed cookies
    const sessionCookie = 
      request.cookies.get("saziate_prod.session_token") || 
      request.cookies.get("saziate_demo.session_token");

    if (!sessionCookie) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();

  // 3. Add origin-safe CORS headers
  const origin = request.headers.get("origin") || "";
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  return response;
}

export const config = {
  matcher: [
    "/psp/:path*",
    "/agent/:path*",
    "/admin/:path*",
    "/resident/:path*",
  ],
};