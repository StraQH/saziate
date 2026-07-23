// src/app/api/auth/[...all]/route.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/lib/auth";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { env } = await getCloudflareContext();
    const dbBinding = (env as Record<string, unknown>).DB as D1Database;
    const authInstance = auth(dbBinding);
    
    return authInstance.handler(request);
  } catch (error) {
    console.error("[AUTH_POST_ERROR]", error);
    return new Response(
      JSON.stringify({ error: "Authentication failed", details: String(error) }), 
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { env } = await getCloudflareContext();
    const dbBinding = (env as Record<string, unknown>).DB as D1Database;
    const authInstance = auth(dbBinding);
    
    return authInstance.handler(request);
  } catch (error) {
    console.error("[AUTH_GET_ERROR]", error);
    return new Response(
      JSON.stringify({ error: "Authentication failed", details: String(error) }), 
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}