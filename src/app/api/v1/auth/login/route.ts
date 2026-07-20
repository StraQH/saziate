import { loginSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SaziateLogger } from "@/lib/logger";

import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "edge";

export async function POST(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), { status: 429, headers: { "Content-Type": "application/json" } });
  }

  const env = process.env as any;
  const db = getDb(env.DB);
  const logger = new SaziateLogger(env.DB);

  try {
    const rawBody = await req.json();
    const parsed = loginSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { email } = body;

    if (!email) {
      return new Response("Missing email.", { status: 400 });
    }

    const userRecord = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!userRecord) {
      return new Response("Invalid credentials.", { status: 401 });
    }

    await logger.logAudit({
      actorId: userRecord.id,
      action: "user.login",
      entityType: "users",
      entityId: userRecord.id,
    });

    return new Response(
      JSON.stringify({
        status: "success",
        user: {
          id: userRecord.id,
          name: userRecord.name,
          email: userRecord.email,
          role: userRecord.role,
          pspId: userRecord.pspId,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
