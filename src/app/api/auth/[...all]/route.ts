// src/app/api/auth/[...all]/route.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/lib/auth";

export const runtime = "edge";

async function handleAuthRequest(request: Request) {
  const { env } = await getCloudflareContext();
  const dbBinding = (env as Record<string, unknown>)?.DB as D1Database;

  if (!dbBinding) {
    console.error("[AUTH_ERROR] D1 Database binding 'DB' is undefined!");
    return new Response(
      JSON.stringify({ error: "Database binding missing" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const authInstance = auth(dbBinding, url.origin);

  return authInstance.handler(request);
}

export async function POST(request: Request) {
  try {
    return await handleAuthRequest(request);
  } catch (error: any) {
    console.error("[AUTH_POST_ERROR]", error?.stack || error);
    return new Response(
      JSON.stringify({ error: "Authentication failed", details: String(error?.message || error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET(request: Request) {
  try {
    return await handleAuthRequest(request);
  } catch (error: any) {
    console.error("[AUTH_GET_ERROR]", error?.stack || error);
    return new Response(
      JSON.stringify({ error: "Authentication failed", details: String(error?.message || error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}