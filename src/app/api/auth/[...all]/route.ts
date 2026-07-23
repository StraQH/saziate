// src/app/api/auth/[...all]/route.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "edge";

export async function POST(request: Request) {
  const { env } = await getCloudflareContext();
  const dbBinding = (env as Record<string, unknown>).DB as D1Database;
  
  const authInstance = auth(dbBinding);
  const handler = toNextJsHandler(authInstance);
  return handler.POST(request);
}

export async function GET(request: Request) {
  const { env } = await getCloudflareContext();
  const dbBinding = (env as Record<string, unknown>).DB as D1Database;

  const authInstance = auth(dbBinding);
  const handler = toNextJsHandler(authInstance);
  return handler.GET(request);
}