// src/app/api/auth/[...all]/route.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/auth";

export const runtime = "edge";

async function handleAuthRequest(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  const dbBinding = (env as Record<string, unknown>)?.DB as D1Database;

  if (!dbBinding) {
    console.error("[AUTH_ERROR] D1 DB binding 'DB' is undefined");
    return new Response(
      JSON.stringify({ error: "Database binding missing" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const authInstance = getAuth(dbBinding, url.origin);

  return authInstance.handler(request);
}

export async function POST(request: Request) {
  try {
    return await handleAuthRequest(request);
  } catch (error: unknown) {
    console.error("[AUTH_POST_ERROR]", error instanceof Error ? error.stack : error);
    const details = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Authentication failed", details }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET(request: Request) {
  try {
    return await handleAuthRequest(request);
  } catch (error: unknown) {
    console.error("[AUTH_GET_ERROR]", error instanceof Error ? error.stack : error);
    const details = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Authentication failed", details }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}