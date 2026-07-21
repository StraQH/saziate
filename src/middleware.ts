import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { config as appConfig } from "@/lib/config";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. Bypass authentication filters completely in Mock Mode for easy testing
  if (appConfig.isMockMode || request.nextUrl.hostname.includes("demo.")) {
    return NextResponse.next();
  }

  // 2. Define protected dashboard path patterns
  const isProtectedPath = 
    path.startsWith("/psp") || 
    path.startsWith("/agent") || 
    path.startsWith("/admin") ||
    path.startsWith("/resident");

  if (isProtectedPath) {
    // Better Auth default session cookie name
    const sessionCookie = request.cookies.get("better-auth.session_token");

    if (!sessionCookie) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();

  // 3. Add CORS headers to all responses
  response.headers.set("Access-Control-Allow-Origin", "*");
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
