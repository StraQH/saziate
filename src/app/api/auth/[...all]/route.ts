export const dynamic = "force-dynamic";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { normalizePhoneNumber } from "@/lib/utils";
import { getAppEnv } from "@/lib/env";


async function handleAuthRequest(request: Request) {
  const env = getAppEnv();
  const dbBinding = env?.DB as unknown as D1Database;

  if (!dbBinding) {
    return new Response(
      JSON.stringify({ error: "Database binding missing" }),
      { status: 500, statusText: "DB_BINDING_MISSING", headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const authInstance = getAuth(dbBinding, url.origin);

  const ip = request.headers.get("x-forwarded-for") || "unknown";

  // Intercept sign-up and sign-in requests
  if (request.method === "POST") {
    
    if (url.pathname.includes("/api/auth/sign-in") || url.pathname.includes("/api/auth/sign-up")) {
      const { checkRateLimit } = await import("@/lib/rate-limit");
      const isAllowed = await checkRateLimit(ip, dbBinding, "auth", { max: 10, windowMs: 60000 });
      if (!isAllowed) {
        return new Response(JSON.stringify({ error: "Too many attempts. Please try again later." }), {
          status: 429,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Intercept sign-in request to allow email OR phone number login
    if (url.pathname.endsWith("/api/auth/sign-in/email")) {
      try {
        const clonedRequest = request.clone();
        const body = await clonedRequest.json() as { email?: string; password?: string };
        const emailInput = body.email ? body.email.toLowerCase().trim() : "";

        if (emailInput) {
          const db = getDb(dbBinding);
          let userRecord = null;

          if (emailInput.endsWith("@saziate.com")) {
            // Dummy email mapped from phone number in client: e.g. +2348012345678@saziate.com
            const phone = emailInput.split("@")[0];
            userRecord = await db
              .select()
              .from(users)
              .where(
                or(
                  eq(users.phone, phone),
                  eq(users.email, emailInput)
                )
              )
              .get();
          } else if (!emailInput.includes("@")) {
            // Raw phone number input
            const phone = normalizePhoneNumber(emailInput);
            userRecord = await db
              .select()
              .from(users)
              .where(
                or(
                  eq(users.phone, phone),
                  eq(users.email, emailInput)
                )
              )
              .get();
          } else {
            // Normal email address
            userRecord = await db
              .select()
              .from(users)
              .where(eq(users.email, emailInput))
              .get();
          }

          if (userRecord && userRecord.email && userRecord.email !== body.email) {
            console.log(`[AUTH_INTERCEPT] Mapping identifier '${body.email}' to actual email '${userRecord.email}' for user '${userRecord.id}'`);
            const modifiedBody = { ...body, email: userRecord.email };
            const newHeaders = new Headers(request.headers);
            newHeaders.delete("content-length");

            const newRequest = new Request(request.url, {
              method: request.method,
              headers: newHeaders,
              body: JSON.stringify(modifiedBody),
              duplex: "half",
            } as RequestInit);

            return authInstance.handler(newRequest);
          }
        }
      } catch (err) {
        console.error("[AUTH_INTERCEPT_ERROR] Failed to map login identifier:", err);
      }
    }
  }

  return authInstance.handler(request);
}

export async function POST(request: Request) {
  try {
    return await handleAuthRequest(request);
  } catch (error: any) {
    console.error("[AUTH_POST_ERROR]", error instanceof Error ? error.stack : error);
    const details = error instanceof Error ? (error as Error).message : String(error);
    return new Response(
      JSON.stringify({ error: "Authentication failed", details }),
      { status: 500, statusText: "AUTH_HANDLER_ERROR", headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET(request: Request) {
  try {
    return await handleAuthRequest(request);
  } catch (error: any) {
    console.error("[AUTH_GET_ERROR]", error instanceof Error ? error.stack : error);
    const details = error instanceof Error ? (error as Error).message : String(error);
    return new Response(
      JSON.stringify({ error: "Authentication failed", details }),
      { status: 500, statusText: "AUTH_HANDLER_ERROR", headers: { "Content-Type": "application/json" } }
    );
  }
}